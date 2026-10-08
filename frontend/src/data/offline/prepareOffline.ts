import { getMyArea } from '../../storage/myAreaStorage'
import { refreshNearbySnapshot, type NearbyRefreshResult } from './nearbySnapshot'

export type OfflineReadinessStatus = 'ready' | 'partial' | 'not-ready'

export interface OfflineReadinessResult {
  status: OfflineReadinessStatus
  /** URLs this device still needs to cache before offline-scope routes will cold-load. */
  missingUrls: string[]
  snapshotResult?: NearbyRefreshResult
  persisted?: boolean
  checkedAt: string
}

const REQUIRED_SHELL_URLS = ['/index.html']
// None of these steps should ever take long, but nothing here is allowed to
// hang the whole flow indefinitely — a stuck service worker registration or
// a browser quirk around navigator.storage.persist() must still resolve to
// a readiness result, even if that result is "not ready".
const STEP_TIMEOUT_MS = 8000

function withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    let settled = false
    const timer = window.setTimeout(() => {
      if (settled) return
      settled = true
      resolve(fallback)
    }, STEP_TIMEOUT_MS)
    promise.then(
      (value) => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        resolve(value)
      },
      () => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        resolve(fallback)
      },
    )
  })
}

async function manifestDataUrls(): Promise<string[]> {
  try {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), STEP_TIMEOUT_MS)
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}data/offline-manifest.json`, {
        cache: 'no-cache',
        signal: controller.signal,
      })
      if (!response.ok) return []
      const manifest = await response.json() as { files?: { file?: string }[] }
      return (manifest.files ?? [])
        .map((entry) => entry.file)
        .filter((file): file is string => typeof file === 'string')
        .map((file) => `${import.meta.env.BASE_URL}data/${file}`)
    } finally {
      window.clearTimeout(timeout)
    }
  } catch {
    // Can't confirm what's required without the manifest — treated as
    // "nothing extra to check" rather than failing readiness outright.
    return []
  }
}

async function findMissingCachedUrls(urls: string[]): Promise<string[]> {
  if (!('caches' in window)) return urls
  const missing: string[] = []
  for (const url of urls) {
    const match = await caches.match(url)
    if (!match) missing.push(url)
  }
  return missing
}

/**
 * Confirms this device can actually use the offline-scope routes with no
 * network, and saves the nearby snapshot for the current My area. Runs
 * after the service worker activates and My area is set, and again on
 * demand from the Offline Information page. Nothing here depends on the
 * backend, so a sleeping Render instance cannot block it — and every step
 * that touches a browser API (service worker, storage) has its own
 * timeout, so a stuck registration or an unresponsive
 * navigator.storage.persist() cannot hang the whole flow either.
 */
export async function prepareOffline(): Promise<OfflineReadinessResult> {
  const checkedAt = new Date().toISOString()

  if (!navigator.serviceWorker) {
    return { status: 'not-ready', missingUrls: REQUIRED_SHELL_URLS, checkedAt }
  }
  const registration = await withTimeout(navigator.serviceWorker.ready, null)
  if (!registration) {
    return { status: 'not-ready', missingUrls: REQUIRED_SHELL_URLS, checkedAt }
  }

  const dataUrls = await manifestDataUrls()
  const requiredUrls = [...REQUIRED_SHELL_URLS, ...dataUrls]
  const missingUrls = await findMissingCachedUrls(requiredUrls)

  let snapshotResult: NearbyRefreshResult | undefined
  if (getMyArea()) {
    snapshotResult = await withTimeout(
      refreshNearbySnapshot().catch(() => undefined),
      undefined,
    )
  }

  let persisted: boolean | undefined
  if (navigator.storage?.persist) {
    persisted = await withTimeout(
      navigator.storage.persist().catch(() => undefined),
      undefined,
    )
  }

  const snapshotFailed = snapshotResult !== undefined && snapshotResult !== 'saved' && snapshotResult !== 'discarded'
  const status: OfflineReadinessStatus =
    missingUrls.length === 0 && !snapshotFailed
      ? 'ready'
      : missingUrls.length < requiredUrls.length
        ? 'partial'
        : 'not-ready'

  return { status, missingUrls, snapshotResult, persisted, checkedAt }
}
