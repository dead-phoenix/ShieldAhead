import { storageKeys } from '../../app/config/product'
import { isWithinBbox, nearestByCategory, type LatLng, type WithDistance } from '../../shared/utils/geo'
import { getMyArea } from '../../storage/myAreaStorage'
import type { MyArea } from '../contracts'
import type { OfflineRegion, OfflineServiceCategory, OfflineServiceRecord } from '../offlineData'
import { loadOfflineDataBundle, type OfflineDataBundle } from './offlineDataLoader'

/** Format of the saved snapshot itself; unrelated to the data files' schemaVersion. */
export const NEARBY_SNAPSHOT_VERSION = 1
/** Degrees added to every side of region.bbox before deciding a point is outside the region. */
export const REGION_BUFFER_DEG = 0.1
export const NEARBY_PER_CATEGORY = 5
export const NEARBY_SNAPSHOT_CHANGED_EVENT = 'shieldahead:nearby-snapshot-changed'

export type NearbyLists = Partial<Record<OfflineServiceCategory, WithDistance<OfflineServiceRecord>[]>>

export interface NearbySnapshot {
  snapshotVersion: typeof NEARBY_SNAPSHOT_VERSION
  schemaVersion: 1
  dataVersion: string
  /** Newest generatedAt of the three service files. */
  dataGeneratedAt: string
  builtAt: string
  region: Pick<OfflineRegion, 'id' | 'name' | 'bbox'>
  originPostcode: string
  originLocalityId?: string
  originLabel: string
  /** Null when neither the locality nor the postcode has a known centre. */
  originPoint: LatLng | null
  /** False when originPoint is missing or outside the region; nearest is then empty. */
  originInRegion: boolean
  nearest: NearbyLists
  /** Every service record, so a live location can be ranked with no network. */
  records: OfflineServiceRecord[]
  attributions: string[]
}

export type NearbyRefreshResult = 'saved' | 'discarded' | 'no-area'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPoint(value: unknown): value is LatLng {
  return isRecord(value) && typeof value.lat === 'number' && typeof value.lng === 'number'
}

function isNearbySnapshot(value: unknown): value is NearbySnapshot {
  if (!isRecord(value)) return false
  if (value.snapshotVersion !== NEARBY_SNAPSHOT_VERSION || value.schemaVersion !== 1) return false
  const region = value.region
  return (
    typeof value.dataVersion === 'string' &&
    typeof value.builtAt === 'string' &&
    typeof value.dataGeneratedAt === 'string' &&
    isRecord(region) &&
    typeof region.name === 'string' &&
    Array.isArray(region.bbox) &&
    region.bbox.length === 4 &&
    typeof value.originPostcode === 'string' &&
    (value.originLocalityId === undefined || typeof value.originLocalityId === 'string') &&
    typeof value.originLabel === 'string' &&
    (value.originPoint === null || isPoint(value.originPoint)) &&
    typeof value.originInRegion === 'boolean' &&
    isRecord(value.nearest) &&
    Array.isArray(value.records) &&
    Array.isArray(value.attributions)
  )
}

let cachedRaw: string | null = null
let cachedSnapshot: NearbySnapshot | null = null

/** Null when there is no snapshot, it cannot be read, or its snapshotVersion is unknown. Returns the same object until storage changes. */
export function readNearbySnapshot(): NearbySnapshot | null {
  let raw: string | null
  try {
    raw = window.localStorage.getItem(storageKeys.nearbySnapshot)
  } catch {
    return null
  }
  if (raw === cachedRaw) return cachedSnapshot
  cachedRaw = raw
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null
    cachedSnapshot = isNearbySnapshot(parsed) ? parsed : null
  } catch {
    cachedSnapshot = null
  }
  return cachedSnapshot
}

export function subscribeToNearbySnapshot(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === storageKeys.nearbySnapshot) onChange()
  }
  window.addEventListener(NEARBY_SNAPSHOT_CHANGED_EVENT, onChange)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(NEARBY_SNAPSHOT_CHANGED_EVENT, onChange)
    window.removeEventListener('storage', onStorage)
  }
}

/** Throws when storage is full or blocked; the previous snapshot is then left untouched. */
function writeNearbySnapshot(snapshot: NearbySnapshot): void {
  window.localStorage.setItem(storageKeys.nearbySnapshot, JSON.stringify(snapshot))
  window.dispatchEvent(new Event(NEARBY_SNAPSHOT_CHANGED_EVENT))
}

function sameArea(left: Pick<MyArea, 'postcode' | 'localityId'>, right: Pick<MyArea, 'postcode' | 'localityId'>): boolean {
  return left.postcode === right.postcode && (left.localityId ?? undefined) === (right.localityId ?? undefined)
}

export function snapshotMatchesArea(snapshot: NearbySnapshot, area: MyArea): boolean {
  return sameArea({ postcode: snapshot.originPostcode, localityId: snapshot.originLocalityId }, area)
}

export function isInRegion(point: LatLng, region: Pick<OfflineRegion, 'bbox'>): boolean {
  return isWithinBbox(point, region.bbox, REGION_BUFFER_DEG)
}

export function rankNearby(records: readonly OfflineServiceRecord[], origin: LatLng): NearbyLists {
  return nearestByCategory(records, origin, NEARBY_PER_CATEGORY)
}

export function resolveAreaPoint(area: Pick<MyArea, 'postcode' | 'localityId'>, bundle: OfflineDataBundle): LatLng | null {
  const locality = area.localityId
    ? bundle.localities.records.find((record) => record.id === area.localityId)
    : undefined
  if (locality) return { lat: locality.lat, lng: locality.lng }
  const postcode = bundle.postcodes.records.find((record) => record.postcode === area.postcode)
  return postcode ? { lat: postcode.lat, lng: postcode.lng } : null
}

export function buildNearbySnapshot(area: MyArea, bundle: OfflineDataBundle, builtAt = new Date().toISOString()): NearbySnapshot {
  const serviceFiles = [bundle.emergencyServices, bundle.wifi, bundle.charities]
  const records = serviceFiles.flatMap((file) => file.records)
  const { id, name, bbox } = bundle.emergencyServices.region
  const region = { id, name, bbox }
  const originPoint = resolveAreaPoint(area, bundle)
  const originInRegion = originPoint !== null && isInRegion(originPoint, region)
  const attributions = [...new Set(
    [...serviceFiles, bundle.postcodes, bundle.localities].flatMap((file) => file.sources.map((source) => source.attribution)),
  )].filter(Boolean)

  return {
    snapshotVersion: NEARBY_SNAPSHOT_VERSION,
    schemaVersion: 1,
    dataVersion: bundle.dataVersion,
    dataGeneratedAt: serviceFiles.map((file) => file.generatedAt).sort().at(-1) ?? '',
    builtAt,
    region,
    originPostcode: area.postcode,
    ...(area.localityId ? { originLocalityId: area.localityId } : {}),
    originLabel: area.label,
    originPoint,
    originInRegion,
    nearest: originPoint && originInRegion ? rankNearby(records, originPoint) : {},
    records,
    attributions,
  }
}

async function buildForCurrentArea(): Promise<NearbyRefreshResult> {
  const area = getMyArea()
  if (!area) return 'no-area'
  const bundle = await loadOfflineDataBundle()
  const current = getMyArea()
  if (!current || !sameArea(area, current)) return 'discarded'
  writeNearbySnapshot(buildNearbySnapshot(current, bundle))
  return 'saved'
}

let running: Promise<NearbyRefreshResult> | null = null
let queued: Promise<NearbyRefreshResult> | null = null

function startBuild(): Promise<NearbyRefreshResult> {
  const promise = buildForCurrentArea()
  running = promise
  const clear = () => {
    if (running === promise) running = null
  }
  promise.then(clear, clear)
  return promise
}

/**
 * Rebuilds the snapshot for the current My area from /data/*.json. Builds run
 * one at a time: a call made during a build waits for it and then builds once
 * more (several such calls share that one follow-up build). A build whose My
 * area changed while the files were loading is discarded. Rejects when the
 * files cannot be loaded or saved, leaving the previous snapshot in place.
 */
export function refreshNearbySnapshot(): Promise<NearbyRefreshResult> {
  if (!running) return startBuild()
  if (!queued) {
    const ignore = () => undefined
    queued = running.then(ignore, ignore).then(() => {
      queued = null
      return startBuild()
    })
  }
  return queued
}
