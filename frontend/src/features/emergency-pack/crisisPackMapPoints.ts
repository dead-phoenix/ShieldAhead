import type { PackPlace } from './emergencyPackStorage'

/** Kinds of place that can be drawn on the crisis pack map. */
export type CrisisPackMapKind = 'wifi' | 'charity'

export interface CrisisPackMapKindStyle {
  /** Letter in front of the list number, e.g. "W" in "W1". */
  prefix: string
  shape: 'circle' | 'square'
  legendLabel: string
}

export const crisisPackMapKinds: Record<CrisisPackMapKind, CrisisPackMapKindStyle> = {
  wifi: { prefix: 'W', shape: 'circle', legendLabel: 'Wi-Fi spot' },
  charity: { prefix: 'C', shape: 'square', legendLabel: 'Charity' },
}

export interface CrisisPackMapPoint {
  id: string
  kind: CrisisPackMapKind
  /** Same label as the place's row in the list, e.g. "C3". */
  label: string
  latitude: number
  longitude: number
}

export const NO_MAP_LOCATION = 'No map location'

/** Mainland Australia and Tasmania; anything outside is a data error, not a place near My area. */
const AUSTRALIA_BOUNDS = { minLatitude: -44, maxLatitude: -9, minLongitude: 112, maxLongitude: 154 }

const POSTAL_ADDRESS_PART = /^\s*(?:(?:G\.?\s*)?P\.?\s*O\.?\s*Box|Post\s+Office\s+Box|(?:Locked|Private)\s+Bag|PMB)\b/i

/** True for PO Box, GPO Box, Locked Bag, Private Bag and PMB addresses, which are not physical locations. */
export function isPostalAddress(address: string | undefined): boolean {
  if (!address) return false
  return address.split(',').some((part) => POSTAL_ADDRESS_PART.test(part))
}

export function isValidMapCoordinate(latitude: unknown, longitude: unknown): boolean {
  return typeof latitude === 'number'
    && typeof longitude === 'number'
    && Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= AUSTRALIA_BOUNDS.minLatitude
    && latitude <= AUSTRALIA_BOUNDS.maxLatitude
    && longitude >= AUSTRALIA_BOUNDS.minLongitude
    && longitude <= AUSTRALIA_BOUNDS.maxLongitude
}

/**
 * Where a saved place can be drawn, or null when it has no physical location.
 *
 * The backend places PO Box charities at their postcode centre, so those
 * coordinates are dropped. Charities without any address come from the
 * bundled offline list, whose points are approximate; they are left off the
 * map too. Some of those records have locationPrecision "street" in
 * offline-charities.json and could be plotted later if that field is carried
 * through to PackPlace.
 */
export function packPlaceMapPosition(
  place: PackPlace,
  kind: CrisisPackMapKind,
): { latitude: number; longitude: number } | null {
  if (!isValidMapCoordinate(place.latitude, place.longitude)) return null
  if (isPostalAddress(place.address)) return null
  if (kind === 'charity' && !place.address?.trim()) return null
  return { latitude: place.latitude as number, longitude: place.longitude as number }
}

export function crisisPackMapLabel(kind: CrisisPackMapKind, index: number): string {
  return `${crisisPackMapKinds[kind].prefix}${index + 1}`
}

export function crisisPackMapPointKey(point: Pick<CrisisPackMapPoint, 'kind' | 'id'>): string {
  return `${point.kind}:${point.id}`
}

/** Changes whenever a plotted place, its position or the map style changes, so a stored street map can be rebuilt. */
export function crisisPackPlacesKey(points: CrisisPackMapPoint[], styleUrl: string): string {
  const places = points
    .map((point) => `${crisisPackMapPointKey(point)}@${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`)
    .sort()
  return [styleUrl, ...places].join('|')
}
