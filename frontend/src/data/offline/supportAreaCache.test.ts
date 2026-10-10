import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { saveMyArea } from '../../storage/myAreaStorage'
import { createApiSupportServiceRepository } from '../api/apiSupportServiceRepository'
import type { DatasetResult, SupportService } from '../contracts'
import { readAllOfflineDatasets, saveOfflineDataset } from './offlineDatasetStore'
import { buildStaticSupportDataset } from './staticSupportFallback'
import {
  readSupportAreaCache,
  refreshSupportAreaCache,
  SUPPORT_CACHE_LIMIT,
  SUPPORT_CACHE_MAX_AGE_MS,
  supportCacheNeedsRefresh,
} from './supportAreaCache'

vi.mock('../preloadNearbyData', () => ({ preloadNearbyData: vi.fn() }))
vi.mock('../api/apiSupportServiceRepository', () => ({ createApiSupportServiceRepository: vi.fn() }))
vi.mock('./staticSupportFallback', () => ({ buildStaticSupportDataset: vi.fn() }))

const list = vi.fn<() => Promise<DatasetResult<SupportService>>>()

function service(index: number, distanceKm?: number): SupportService {
  return {
    id: `acnc-${index}`,
    name: `Charity ${index}`,
    serviceTypes: ['Food relief'],
    suburb: 'Harcourt',
    postcode: '3453',
    distanceKm,
    availabilityStatus: 'not-confirmed',
    dataUpdatedAt: '2026-10-01T00:00:00.000Z',
  }
}

function dataset(records: SupportService[]): DatasetResult<SupportService> {
  return {
    records,
    metadata: { version: '1', generatedAt: '2026-10-01T00:00:00.000Z', sourceName: 'Test', coverageAreas: [], limitations: [] },
  }
}

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value })
}

describe('support area cache', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'indexedDB', { configurable: true, value: new IDBFactory() })
    setOnline(true)
    list.mockReset()
    vi.mocked(createApiSupportServiceRepository).mockReturnValue({ list })
    vi.mocked(buildStaticSupportDataset).mockResolvedValue(null)
    saveMyArea({ postcode: '3453', localityName: 'Harcourt' })
  })

  afterEach(() => {
    setOnline(true)
  })

  it('saves the 20 nearest services for My area and reads them back', async () => {
    const records = Array.from({ length: 30 }, (_, index) => service(index, 30 - index))
    list.mockResolvedValue(dataset(records))

    expect(await refreshSupportAreaCache()).toBe('saved')

    const cache = await readSupportAreaCache('3453')
    expect(cache?.count).toBe(SUPPORT_CACHE_LIMIT)
    expect(cache?.records[0].distanceKm).toBe(1)
    expect(cache?.areaLabel).toBe('Harcourt 3453')
    expect(cache?.dataSource).toBe('api')
    expect(vi.mocked(createApiSupportServiceRepository)).toHaveBeenCalledWith(
      expect.objectContaining({ postcode: '3453', timeoutMs: 60_000 }),
    )
  })

  it('saves fewer than 20 when fewer are found', async () => {
    list.mockResolvedValue(dataset([service(1, 2), service(2, 1)]))

    await refreshSupportAreaCache()

    expect((await readSupportAreaCache('3453'))?.records.map(({ id }) => id)).toEqual(['acnc-2', 'acnc-1'])
  })

  it('does not download again while the saved copy is current', async () => {
    list.mockResolvedValue(dataset([service(1, 1)]))
    await refreshSupportAreaCache()

    expect(await refreshSupportAreaCache()).toBe('fresh')
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('runs one request at a time', async () => {
    list.mockResolvedValue(dataset([service(1, 1)]))

    const results = await Promise.all([refreshSupportAreaCache(), refreshSupportAreaCache(), refreshSupportAreaCache()])

    expect(results).toEqual(['saved', 'fresh', 'fresh'])
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('keeps nothing when the API fails outside the offline region, then saves on retry', async () => {
    list.mockRejectedValueOnce(new Error('Server unavailable.'))

    expect(await refreshSupportAreaCache()).toBe('failed')
    expect(await readSupportAreaCache('3453')).toBeNull()

    list.mockResolvedValue(dataset([service(1, 1)]))
    expect(await refreshSupportAreaCache()).toBe('saved')
    expect((await readSupportAreaCache('3453'))?.count).toBe(1)
  })

  it('falls back to the offline charity list and still retries the API later', async () => {
    list.mockRejectedValueOnce(new Error('Server unavailable.'))
    vi.mocked(buildStaticSupportDataset).mockResolvedValue(dataset([service(9, 3)]))

    expect(await refreshSupportAreaCache()).toBe('static')
    expect((await readSupportAreaCache('3453'))?.dataSource).toBe('static')

    list.mockResolvedValue(dataset([service(1, 1)]))
    expect(await refreshSupportAreaCache()).toBe('saved')
    expect((await readSupportAreaCache('3453'))?.dataSource).toBe('api')
  })

  it('discards the result when My area changes during the download', async () => {
    list.mockImplementation(async () => {
      saveMyArea({ postcode: '3550' })
      return dataset([service(1, 1)])
    })

    expect(await refreshSupportAreaCache({ force: true })).toBe('discarded')
    expect(await readAllOfflineDatasets('support')).toEqual([])
  })

  it('removes the previous area when a new area is saved', async () => {
    list.mockResolvedValue(dataset([service(1, 1)]))
    await refreshSupportAreaCache()

    saveMyArea({ postcode: '3550' })
    await refreshSupportAreaCache()

    expect((await readAllOfflineDatasets('support')).map(({ key }) => key)).toEqual(['support:3550'])
  })

  it('does nothing while offline', async () => {
    setOnline(false)

    expect(await refreshSupportAreaCache({ force: true })).toBe('offline')
    expect(list).not.toHaveBeenCalled()
  })

  it('treats old, static or other-area copies as needing a refresh', async () => {
    await saveOfflineDataset('support', '3453', dataset([service(1, 1)]), { areaLabel: 'Harcourt 3453', dataSource: 'api' })
    const cache = await readSupportAreaCache('3453')
    const area = { postcode: '3453', label: 'Harcourt 3453' }
    const now = Date.parse(cache!.savedAt)

    expect(supportCacheNeedsRefresh(cache, area, now)).toBe(false)
    expect(supportCacheNeedsRefresh(cache, area, now + SUPPORT_CACHE_MAX_AGE_MS + 1)).toBe(true)
    expect(supportCacheNeedsRefresh({ ...cache!, dataSource: 'static' }, area, now)).toBe(true)
    expect(supportCacheNeedsRefresh(cache, { postcode: '3550', label: '3550' }, now)).toBe(true)
    expect(supportCacheNeedsRefresh(null, area, now)).toBe(true)
  })
})
