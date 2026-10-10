import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { storageKeys } from '../../app/config/product'
import { saveOfflineDataset } from '../../data/offline/offlineDatasetStore'
import { getSavedPlace } from '../../storage/savedPlacesStorage'
import { migrateUsualWifiSpot } from './migrateUsualWifiSpot'

describe('usual Wi-Fi spot migration', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'indexedDB', { configurable: true, value: new IDBFactory() })
  })

  it('does nothing when no usual spot was set', async () => {
    expect(await migrateUsualWifiSpot()).toBe('none')
  })

  it('moves a usual spot into saved places when its record is on this device', async () => {
    await saveOfflineDataset('wifi', '3453', {
      records: [{ id: 'library', name: 'Harcourt Library', suburb: 'Harcourt', postcode: '3453', distanceKm: 1.4, dataUpdatedAt: '2026-09-01T00:00:00.000Z' }],
      metadata: { version: '1', generatedAt: '2026-09-01T00:00:00.000Z', sourceName: 'Test', coverageAreas: [], limitations: [] },
    })
    window.localStorage.setItem(storageKeys.usualWifiSpot, 'library')

    expect(await migrateUsualWifiSpot()).toBe('migrated')
    expect(getSavedPlace('wifi:library')?.record.name).toBe('Harcourt Library')
    expect(getSavedPlace('wifi:library')?.record).not.toHaveProperty('distanceKm')
    expect(window.localStorage.getItem(storageKeys.usualWifiSpot)).toBeNull()
  })

  it('drops a usual spot whose record is not on this device', async () => {
    window.localStorage.setItem(storageKeys.usualWifiSpot, 'gone')

    expect(await migrateUsualWifiSpot()).toBe('dropped')
    expect(getSavedPlace('wifi:gone')).toBeUndefined()
    expect(window.localStorage.getItem(storageKeys.usualWifiSpot)).toBeNull()
    expect(await migrateUsualWifiSpot()).toBe('none')
  })
})
