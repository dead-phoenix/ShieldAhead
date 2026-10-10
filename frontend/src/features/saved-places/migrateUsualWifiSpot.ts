import { storageKeys } from '../../app/config/product'
import type { WifiLocation } from '../../data/contracts'
import { readAllOfflineDatasets } from '../../data/offline/offlineDatasetStore'
import { savePlace } from '../../storage/savedPlacesStorage'
import { savedPlaceFromWifiLocation } from './savedPlaceRecords'

export type UsualSpotMigrationResult = 'none' | 'migrated' | 'dropped'

/**
 * One-time move of the retired "usual Wi-Fi spot" into saved places. Only the
 * id was ever stored, so the place is migrated when a saved Wi-Fi dataset on
 * this device still has its record; otherwise the id is dropped.
 */
export async function migrateUsualWifiSpot(): Promise<UsualSpotMigrationResult> {
  let id: string | null
  try {
    id = window.localStorage.getItem(storageKeys.usualWifiSpot)
  } catch {
    return 'none'
  }
  if (!id) return 'none'

  let record: WifiLocation | undefined
  try {
    const datasets = await readAllOfflineDatasets<WifiLocation>('wifi')
    record = datasets.flatMap((dataset) => dataset.data.records).find((item) => item.id === id)
  } catch {
    record = undefined
  }
  const migrated = record ? savePlace(savedPlaceFromWifiLocation(record)) === 'saved' : false

  try {
    window.localStorage.removeItem(storageKeys.usualWifiSpot)
  } catch {
    // Nothing else to do; the key is retired either way.
  }
  return migrated ? 'migrated' : 'dropped'
}
