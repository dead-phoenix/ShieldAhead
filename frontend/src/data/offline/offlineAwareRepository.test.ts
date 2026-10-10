import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatasetResult, WifiLocation } from '../contracts'
import { createOfflineAwareRepository } from './offlineAwareRepository'
import {
  clearAllOfflineDatasets,
  getOfflineDatasetSummaries,
  readOfflineDataset,
  removeOfflineDataset,
  saveOfflineDataset,
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

  it('does not save a downloaded dataset', async () => {
    const onlineRepository = { list: vi.fn().mockResolvedValue(dataset) }
    const result = await createOfflineAwareRepository<WifiLocation>({
      kind: 'wifi',
      postcode: '3453',
      onlineRepository,
      isOnline: () => true,
    }).list()

    expect(result.metadata.dataOrigin).toBe('network')
    expect(await readOfflineDataset('wifi', '3453')).toBeNull()
  })

  it('reads a saved copy when the app is offline', async () => {
    await saveOfflineDataset('wifi', '3453', dataset)
    const onlineRepository = { list: vi.fn().mockResolvedValue(dataset) }
    const result = await createOfflineAwareRepository<WifiLocation>({
      kind: 'wifi',
      postcode: '3453',
      onlineRepository,
      isOnline: () => false,
    }).list()

    expect(result.records[0].name).toBe('Library Wi-Fi')
    expect(result.metadata.dataOrigin).toBe('cache')
    expect(result.metadata.cachedAt).toBeTruthy()
    expect(onlineRepository.list).not.toHaveBeenCalled()
  })

  it('falls back to the saved copy when an online refresh fails', async () => {
    await saveOfflineDataset('wifi', '3453', dataset)
    const failingRepository = { list: vi.fn().mockRejectedValue(new Error('Server unavailable.')) }
    const result = await createOfflineAwareRepository<WifiLocation>({
      kind: 'wifi',
      postcode: '3453',
      onlineRepository: failingRepository,
      isOnline: () => true,
    }).list()

    expect(result.metadata.dataOrigin).toBe('cache')
    expect(result.metadata.freshnessStatus).toBe('stale')
    expect(result.metadata.refreshError).toBe('Server unavailable.')
  })

  it('explains when nothing is saved for this postcode offline', async () => {
    const repository = createOfflineAwareRepository<WifiLocation>({
      kind: 'wifi',
      postcode: '3453',
      onlineRepository: { list: vi.fn().mockResolvedValue(dataset) },
      isOnline: () => false,
    })

    await expect(repository.list()).rejects.toThrow('No saved information is available for this postcode.')
  })

  it('reports record counts and removes stored datasets', async () => {
    await saveOfflineDataset('wifi', '3453', dataset)

    expect((await getOfflineDatasetSummaries('3453')).wifi?.recordCount).toBe(1)
    await removeOfflineDataset('wifi', '3453')
    expect(await readOfflineDataset('wifi', '3453')).toBeNull()
    await clearAllOfflineDatasets()
  })
})
