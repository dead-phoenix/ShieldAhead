import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatasetResult, WifiLocation } from '../contracts'
import { createOfflineAwareRepository } from './offlineAwareRepository'
import {
  clearAllOfflineDatasets,
  getOfflineDatasetSummaries,
  readOfflineDataset,
  removeOfflineDataset,
} from './offlineDatasetStore'

const dataset: DatasetResult<WifiLocation> = {
  records: [{
    id: 'wifi-1',
    name: 'Library Wi-Fi',
    suburb: 'Harcourt',
    postcode: '3453',
    dataUpdatedAt: '2026-09-04T00:00:00.000Z',
  }],
  metadata: {
    version: '1.0',
    generatedAt: '2026-09-04T00:00:00.000Z',
    sourceName: 'Test source',
    coverageAreas: ['3453'],
    limitations: [],
  },
}

describe('offline-aware repository', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      value: new IDBFactory(),
    })
  })

  it('saves a downloaded dataset and reads it after the app goes offline', async () => {
    const onlineRepository = { list: vi.fn().mockResolvedValue(dataset) }
    const online = createOfflineAwareRepository<WifiLocation>({
      kind: 'wifi',
      postcode: '3453',
      source: 'api',
      onlineRepository,
      shouldSave: () => true,
      isOnline: () => true,
    })
    await online.list()

    const offline = createOfflineAwareRepository<WifiLocation>({
      kind: 'wifi',
      postcode: '3453',
      source: 'api',
      onlineRepository,
      shouldSave: () => true,
      isOnline: () => false,
    })
    const result = await offline.list()

    expect(result.records[0].name).toBe('Library Wi-Fi')
    expect(result.metadata.dataOrigin).toBe('cache')
    expect(result.metadata.cachedAt).toBeTruthy()
    expect(onlineRepository.list).toHaveBeenCalledTimes(1)
  })

  it('falls back to the saved copy when an online refresh fails', async () => {
    const successfulRepository = { list: vi.fn().mockResolvedValue(dataset) }
    await createOfflineAwareRepository<WifiLocation>({
      kind: 'wifi',
      postcode: '3453',
      source: 'api',
      onlineRepository: successfulRepository,
      shouldSave: () => true,
      isOnline: () => true,
    }).list()

    const failingRepository = { list: vi.fn().mockRejectedValue(new Error('Server unavailable.')) }
    const result = await createOfflineAwareRepository<WifiLocation>({
      kind: 'wifi',
      postcode: '3453',
      source: 'api',
      onlineRepository: failingRepository,
      shouldSave: () => true,
      isOnline: () => true,
    }).list()

    expect(result.metadata.dataOrigin).toBe('cache')
    expect(result.metadata.freshnessStatus).toBe('stale')
    expect(result.metadata.refreshError).toBe('Server unavailable.')
  })

  it('does not expose cached data after the user turns saving off', async () => {
    const onlineRepository = { list: vi.fn().mockResolvedValue(dataset) }
    await createOfflineAwareRepository<WifiLocation>({
      kind: 'wifi',
      postcode: '3453',
      source: 'api',
      onlineRepository,
      shouldSave: () => true,
      isOnline: () => true,
    }).list()

    const repository = createOfflineAwareRepository<WifiLocation>({
      kind: 'wifi',
      postcode: '3453',
      source: 'api',
      onlineRepository,
      shouldSave: () => false,
      isOnline: () => false,
    })

    await expect(repository.list()).rejects.toThrow('not selected for offline use')
  })

  it('reports record counts and removes stored datasets', async () => {
    const repository = createOfflineAwareRepository<WifiLocation>({
      kind: 'wifi',
      postcode: '3453',
      source: 'api',
      onlineRepository: { list: vi.fn().mockResolvedValue(dataset) },
      shouldSave: () => true,
      isOnline: () => true,
    })
    await repository.list()

    expect((await getOfflineDatasetSummaries('3453')).wifi?.recordCount).toBe(1)
    await removeOfflineDataset('wifi', '3453')
    expect(await readOfflineDataset('wifi', '3453')).toBeNull()
    await clearAllOfflineDatasets()
  })
})
