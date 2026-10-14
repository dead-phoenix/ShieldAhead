import { storageKeys } from '../app/config/product'
import { deleteOfflineDatabase } from '../data/offline/offlineDatasetStore'
import { deleteCrisisPackDatabase } from '../features/emergency-pack/crisisPackMapStorage'

const APP_STORAGE_PREFIX = 'shieldahead.'

function removeAppKeys(storage: Storage, keep: ReadonlySet<string>) {
  const keys: string[] = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key?.startsWith(APP_STORAGE_PREFIX) && !keep.has(key)) keys.push(key)
  }
  keys.forEach((key) => storage.removeItem(key))
}

/**
 * Removes everything ShieldAhead keeps on this device except the site-unlocked
 * flag: profile, consent, setup draft, My area, search location, checklist
 * ticks, crisis pack and its street map picture, saved routes, map session,
 * offline preferences and the downloaded offline datasets.
 */
export async function clearAllLocalData(): Promise<void> {
  try {
    removeAppKeys(window.localStorage, new Set([storageKeys.siteUnlocked]))
  } catch {
    // Storage may be blocked; continue with the remaining stores.
  }
  try {
    removeAppKeys(window.sessionStorage, new Set())
  } catch {
    // As above.
  }
  await Promise.all([deleteOfflineDatabase(), deleteCrisisPackDatabase()])
}
