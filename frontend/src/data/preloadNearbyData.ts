import { getSupportServiceRepository } from './supportServiceRepository'
import { getWifiRepository } from './wifiRepository'

interface PreloadOptions {
  /** False for the My area postcode: the support-list cache job already requests it. */
  includeSupport?: boolean
}

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
export function preloadNearbyData(postcode: string, { includeSupport = true }: PreloadOptions = {}): void {
  getWifiRepository(postcode).list().catch(() => {})
  if (includeSupport) getSupportServiceRepository(postcode).list().catch(() => {})
}
