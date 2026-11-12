import { deleteOfflineDatabase } from '../data/offline/offlineDatasetStore'
import { deleteCrisisPackDatabase } from '../features/emergency-pack/crisisPackMapStorage'

const APP_STORAGE_PREFIX = 'shieldahead.'

function removeAppKeys(storage: Storage) {
  const keys: string[] = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key?.startsWith(APP_STORAGE_PREFIX)) keys.push(key)
  }
  keys.forEach((key) => storage.removeItem(key))
}

/**
 * Removes everything ShieldAhead keeps on this device: profile, consent, setup
 * draft, My area, search location, checklist ticks, crisis pack and its street
 * map picture, saved routes, map session, offline preferences and the
 * downloaded offline datasets.
 */
export async function clearAllLocalData(): Promise<void> {
  try {
    removeAppKeys(window.localStorage)
  } catch {
    // Storage may be blocked; continue with the remaining stores.
  }
  try {
    removeAppKeys(window.sessionStorage)
  } catch {
    // As above.
  }
  await Promise.all([deleteOfflineDatabase(), deleteCrisisPackDatabase()])
}
