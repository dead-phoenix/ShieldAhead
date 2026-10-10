import type { SupportAreaCacheState } from '../../data/offline/useSupportAreaCache'
import { formatSavedDate } from '../../shared/utils/formatDate'

/** Describes only what was read back from the device; never claims a save that is not there. */
export function describeSupportCache({ area, cache, isReading, activity }: SupportAreaCacheState): string {
  if (!area) return 'Set My area to save the nearest support services on this device.'
  if (activity === 'saving') return `Saving the nearest support services for ${area.label}…`
  if (isReading) return 'Checking the support services saved on this device…'
  if (!cache) return "Not saved yet. We'll try again when you're online."
  const date = formatSavedDate(cache.savedAt)
  if (cache.count === 0) return `No support services were found near ${cache.areaLabel}. Checked ${date}.`
  const noun = cache.count === 1 ? 'support service' : 'support services'
  const saved = `Saved ${cache.count} nearest ${noun} for ${cache.areaLabel} on ${date}.`
  return cache.dataSource === 'static'
    ? `${saved} Approximate locations from the offline list. We'll update it when the full list can be reached.`
    : saved
}
