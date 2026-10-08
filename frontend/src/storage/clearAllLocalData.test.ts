import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { storageKeys } from '../app/config/product'
import { readOfflineDataset, saveOfflineDataset } from '../data/offline/offlineDatasetStore'
import { clearAllLocalData } from './clearAllLocalData'

const originalIndexedDb = Object.getOwnPropertyDescriptor(window, 'indexedDB')

describe('clearAllLocalData', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'indexedDB', { configurable: true, value: new IDBFactory() })
  })

  afterEach(() => {
    if (originalIndexedDb) Object.defineProperty(window, 'indexedDB', originalIndexedDb)
    else Reflect.deleteProperty(window, 'indexedDB')
    window.sessionStorage.clear()
  })

  it('removes everything saved on this device except the site-unlocked flag', async () => {
    const seeded = [
      storageKeys.householdProfile,
      storageKeys.consent,
      storageKeys.onboardingDraft,
      storageKeys.myArea,
      storageKeys.searchLocation,
      storageKeys.usualWifiSpot,
      storageKeys.emergencyPack,
      storageKeys.offlinePreferences,
      `${storageKeys.crisisChecklist}.bushfire`,
      `${storageKeys.crisisChecklist}.flood`,
      `${storageKeys.crisisChecklist}.power-outage`,
      'shieldahead.map.offlineRoutes.v1',
    ]
    seeded.forEach((key) => window.localStorage.setItem(key, '{}'))
    window.localStorage.setItem(storageKeys.siteUnlocked, 'true')
    window.localStorage.setItem('another-site.setting', 'kept')
    window.sessionStorage.setItem('shieldahead.map.session.v1', '{}')
    await saveOfflineDataset('wifi', '3453', {
      records: [],
      metadata: { version: '1', generatedAt: '', sourceName: '', coverageAreas: [], limitations: [] },
    })

    await clearAllLocalData()

    seeded.forEach((key) => expect(window.localStorage.getItem(key), key).toBeNull())
    expect(window.localStorage.getItem(storageKeys.siteUnlocked)).toBe('true')
    expect(window.localStorage.getItem('another-site.setting')).toBe('kept')
    expect(window.sessionStorage.getItem('shieldahead.map.session.v1')).toBeNull()
    expect(await window.indexedDB.databases()).toEqual([])
    expect(await readOfflineDataset('wifi', '3453')).toBeNull()
  })
})
