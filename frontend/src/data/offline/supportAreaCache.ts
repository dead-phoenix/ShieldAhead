import { getMyArea } from '../../storage/myAreaStorage'
import { createApiSupportServiceRepository } from '../api/apiSupportServiceRepository'
import type { DatasetMetadata, DatasetResult, MyArea, SupportService } from '../contracts'
import {
  readOfflineDataset,
  removeOfflineDataset,
  removeOfflineDatasetsExcept,
  saveOfflineDataset,
  type OfflineDatasetSource,
} from './offlineDatasetStore'
import { buildStaticSupportDataset } from './staticSupportFallback'

export const SUPPORT_CACHE_LIMIT = 20
export const SUPPORT_CACHE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000
/** Long enough for a sleeping Render instance to wake; this never blocks the UI. */
export const SUPPORT_CACHE_TIMEOUT_MS = 60_000
export const SUPPORT_CACHE_ACTIVITY_EVENT = 'shieldahead:support-cache-activity'

export type SupportCacheActivity = 'idle' | 'saving' | 'failed'
export type SupportCacheResult =
  | 'saved'
  | 'static'
  | 'fresh'
  | 'discarded'
  | 'no-area'
  | 'offline'
  | 'unsupported'
  | 'failed'

export interface SupportAreaCache {
  postcode: string
  areaLabel: string
  savedAt: string
  count: number
  dataSource: OfflineDatasetSource
  records: SupportService[]
  metadata: DatasetMetadata
}

let activity: SupportCacheActivity = 'idle'

function setActivity(next: SupportCacheActivity) {
  if (activity === next) return
  activity = next
  window.dispatchEvent(new Event(SUPPORT_CACHE_ACTIVITY_EVENT))
}

export function getSupportCacheActivity(): SupportCacheActivity {
  return activity
}

export function subscribeToSupportCacheActivity(onChange: () => void): () => void {
  window.addEventListener(SUPPORT_CACHE_ACTIVITY_EVENT, onChange)
  return () => window.removeEventListener(SUPPORT_CACHE_ACTIVITY_EVENT, onChange)
}

export async function readSupportAreaCache(postcode: string): Promise<SupportAreaCache | null> {
  const stored = await readOfflineDataset<SupportService>('support', postcode)
  if (!stored || !Array.isArray(stored.data?.records)) return null
  return {
    postcode: stored.postcode,
    areaLabel: stored.areaLabel ?? stored.postcode,
    savedAt: stored.savedAt,
    count: stored.count ?? stored.data.records.length,
    dataSource: stored.dataSource ?? 'api',
    records: stored.data.records,
    metadata: stored.data.metadata,
  }
}

/** A static (offline-list) copy always needs a refresh, so the API is retried. */
export function supportCacheNeedsRefresh(
  cache: SupportAreaCache | null,
  area: Pick<MyArea, 'postcode' | 'label'>,
  now = Date.now(),
): boolean {
  if (!cache) return true
  if (cache.postcode !== area.postcode || cache.areaLabel !== area.label) return true
  if (cache.dataSource === 'static') return true
  const age = now - Date.parse(cache.savedAt)
  return !Number.isFinite(age) || age > SUPPORT_CACHE_MAX_AGE_MS
}

/** Nearest first; records without a distance go last, in their original order. */
export function nearestSupportServices(records: SupportService[], limit = SUPPORT_CACHE_LIMIT): SupportService[] {
  return records
    .map((record, index) => ({ record, index }))
    .sort((left, right) =>
      (left.record.distanceKm ?? Number.POSITIVE_INFINITY) - (right.record.distanceKm ?? Number.POSITIVE_INFINITY)
      || left.index - right.index)
    .slice(0, limit)
    .map(({ record }) => record)
}

function downloadSupportDataset(postcode: string): Promise<DatasetResult<SupportService>> {
  return createApiSupportServiceRepository({
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
    postcode,
    timeoutMs: SUPPORT_CACHE_TIMEOUT_MS,
  }).list()
}

function isCurrentArea(postcode: string): boolean {
  return getMyArea()?.postcode === postcode
}

async function saveForCurrentArea(force: boolean): Promise<SupportCacheResult> {
  const area = getMyArea()
  if (!area) return 'no-area'
  if (!navigator.onLine) return 'offline'
  if (!('indexedDB' in window)) return 'unsupported'

  if (!force) {
    const existing = await readSupportAreaCache(area.postcode).catch(() => null)
    if (!supportCacheNeedsRefresh(existing, area)) return 'fresh'
  }

  setActivity('saving')
  let dataset: DatasetResult<SupportService>
  let dataSource: OfflineDatasetSource
  try {
    dataset = await downloadSupportDataset(area.postcode)
    dataSource = 'api'
  } catch {
    const fallback = isCurrentArea(area.postcode)
      ? await buildStaticSupportDataset(area, SUPPORT_CACHE_LIMIT)
      : null
    if (!fallback) {
      setActivity(isCurrentArea(area.postcode) ? 'failed' : 'idle')
      return isCurrentArea(area.postcode) ? 'failed' : 'discarded'
    }
    dataset = fallback
    dataSource = 'static'
  }

  if (!isCurrentArea(area.postcode)) {
    setActivity('idle')
    return 'discarded'
  }

  const records = nearestSupportServices(dataset.records)
  try {
    const savedAt = await saveOfflineDataset(
      'support',
      area.postcode,
      { records, metadata: dataset.metadata },
      { areaLabel: area.label, dataSource },
    )
    if (!isCurrentArea(area.postcode)) {
      await removeOfflineDataset('support', area.postcode).catch(() => undefined)
      setActivity('idle')
      return 'discarded'
    }
    const reread = await readSupportAreaCache(area.postcode)
    if (!reread || reread.savedAt !== savedAt || reread.records.length !== records.length) {
      throw new Error('The saved support list could not be read back.')
    }
    await removeOfflineDatasetsExcept('support', area.postcode).catch(() => undefined)
  } catch {
    setActivity('failed')
    return 'failed'
  }

  setActivity('idle')
  return dataSource === 'api' ? 'saved' : 'static'
}

let running: Promise<SupportCacheResult> | null = null
let queued: Promise<SupportCacheResult> | null = null

function start(force: boolean): Promise<SupportCacheResult> {
  const promise = saveForCurrentArea(force).catch((): SupportCacheResult => {
    setActivity('failed')
    return 'failed'
  })
  running = promise
  const clear = () => {
    if (running === promise) running = null
  }
  void promise.then(clear)
  return promise
}

/**
 * Saves the nearest support services for My area under support:<postcode>.
 * One request at a time: a call made during a run waits for it and then
 * checks once more (several such calls share that follow-up). Without
 * force, nothing is downloaded while the saved copy is current. Never
 * rejects; failures leave the previous copy in place.
 */
export function refreshSupportAreaCache({ force = false }: { force?: boolean } = {}): Promise<SupportCacheResult> {
  if (!running) return start(force)
  if (!queued) {
    queued = running.then(() => {
      queued = null
      return start(false)
    })
  }
  return queued
}
