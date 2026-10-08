import type { OfflineServiceCategory, OfflineServiceRecord } from '../../data/offlineData'

export interface LatLng {
  lat: number
  lng: number
}

export type WithDistance<T> = T & { distanceKm: number }

const EARTH_RADIUS_KM = 6371

function isValidPoint(point: LatLng): boolean {
  return (
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lng) <= 180
  )
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

/** bbox is [minLng, minLat, maxLng, maxLat]; bufferDeg widens every side. */
export function isWithinBbox(
  point: LatLng,
  bbox: readonly [number, number, number, number],
  bufferDeg = 0,
): boolean {
  if (!isValidPoint(point)) return false
  const [minLng, minLat, maxLng, maxLat] = bbox
  return (
    point.lng >= minLng - bufferDeg &&
    point.lng <= maxLng + bufferDeg &&
    point.lat >= minLat - bufferDeg &&
    point.lat <= maxLat + bufferDeg
  )
}

/** The n closest records per category, nearest first (ties broken by id).
 * Records with missing or invalid coordinates are skipped. */
export function nearestByCategory<T extends Pick<OfflineServiceRecord, 'id' | 'category' | 'lat' | 'lng'>>(
  records: readonly T[],
  origin: LatLng,
  n = 6,
): Partial<Record<OfflineServiceCategory, WithDistance<T>[]>> {
  const result: Partial<Record<OfflineServiceCategory, WithDistance<T>[]>> = {}
  if (!isValidPoint(origin) || n <= 0) return result

  const grouped = new Map<OfflineServiceCategory, WithDistance<T>[]>()
  for (const record of records) {
    if (!isValidPoint(record)) continue
    const list = grouped.get(record.category) ?? []
    list.push({ ...record, distanceKm: haversineKm(origin, record) })
    grouped.set(record.category, list)
  }

  for (const [category, list] of grouped) {
    list.sort((a, b) => a.distanceKm - b.distanceKm || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    result[category] = list.slice(0, n)
  }
  return result
}
