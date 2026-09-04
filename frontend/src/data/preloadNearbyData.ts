import { getSupportServiceRepository } from './supportServiceRepository'
import { getWifiRepository } from './wifiRepository'

/**
 * Best-effort background warm-up: as soon as a postcode is known, start
 * loading wifi and support-service data for it, so the Wifi and Support
 * Services pages are more likely to already have data (or be part-way
 * through fetching it) by the time the household actually opens them --
 * and so it is fetched before they might go offline.
 *
 * Failures here are silently ignored: this is only a cache warm-up, not a
 * user-facing fetch. If it fails, the relevant page just fetches normally
 * when opened, exactly as it did before this existed.
 */
export function preloadNearbyData(postcode: string): void {
  const wifiRepository = getWifiRepository(postcode)
  const supportRepository = getSupportServiceRepository(postcode)

  wifiRepository.list().catch(() => {})
  supportRepository.list().catch(() => {})
}
