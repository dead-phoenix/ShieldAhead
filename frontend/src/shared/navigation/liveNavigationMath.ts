import type { NavigationStep } from '../../data/api/directionsApi'

export interface GeoPoint {
  latitude: number
  longitude: number
}

export const OFF_ROUTE_THRESHOLD_METERS = 50
export const ARRIVAL_THRESHOLD_METERS = 20

const EARTH_RADIUS_METERS = 6_371_000

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRadians(b.latitude - a.latitude)
  const dLng = toRadians(b.longitude - a.longitude)
  const lat1 = toRadians(a.latitude)
  const lat2 = toRadians(b.latitude)
  const sinDLat = Math.sin(dLat / 2)
  const sinDLng = Math.sin(dLng / 2)
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(Math.min(1, h)))
}

function coordinateToPoint([longitude, latitude]: [number, number]): GeoPoint {
  return { latitude, longitude }
}

// A flat, locally-accurate metres projection centred on `origin` — segments
// here span at most a few hundred metres, so the curvature of the earth
// doesn't matter and this is far cheaper than true great-circle projection.
function toLocalMeters(origin: GeoPoint, point: GeoPoint): { x: number; y: number } {
  const metersPerDegreeLat = 111_320
  const metersPerDegreeLng = 111_320 * Math.cos(toRadians(origin.latitude))
  return {
    x: (point.longitude - origin.longitude) * metersPerDegreeLng,
    y: (point.latitude - origin.latitude) * metersPerDegreeLat,
  }
}

export interface NearestPointResult {
  /** Index i such that the nearest point lies on the segment coordinates[i] -> coordinates[i+1]. */
  segmentIndex: number
  point: GeoPoint
  distanceMeters: number
  /** 0..1 fraction of the way from the segment's start to its end. */
  t: number
}

export function nearestPointOnRoute(position: GeoPoint, coordinates: [number, number][]): NearestPointResult | undefined {
  let best: NearestPointResult | undefined

  for (let i = 0; i < coordinates.length - 1; i++) {
    const segStart = coordinateToPoint(coordinates[i])
    const segEnd = coordinateToPoint(coordinates[i + 1])
    const end = toLocalMeters(segStart, segEnd)
    const p = toLocalMeters(segStart, position)
    const segLengthSquared = end.x * end.x + end.y * end.y
    const t = segLengthSquared === 0 ? 0 : Math.max(0, Math.min(1, (p.x * end.x + p.y * end.y) / segLengthSquared))
    const closest: GeoPoint = {
      longitude: segStart.longitude + (segEnd.longitude - segStart.longitude) * t,
      latitude: segStart.latitude + (segEnd.latitude - segStart.latitude) * t,
    }
    const distanceMeters = haversineMeters(position, closest)
    if (!best || distanceMeters < best.distanceMeters) {
      best = { segmentIndex: i, point: closest, distanceMeters, t }
    }
  }

  return best
}

/** Cumulative route distance (metres) at each coordinate index — same length as `coordinates`. */
export function cumulativeDistancesMeters(coordinates: [number, number][]): number[] {
  const cumulative = [0]
  for (let i = 1; i < coordinates.length; i++) {
    cumulative.push(cumulative[i - 1] + haversineMeters(coordinateToPoint(coordinates[i - 1]), coordinateToPoint(coordinates[i])))
  }
  return cumulative
}

export function progressMeters(cumulative: number[], nearest: NearestPointResult): number {
  const segStartDistance = cumulative[nearest.segmentIndex]
  const segEndDistance = cumulative[nearest.segmentIndex + 1]
  return segStartDistance + (segEndDistance - segStartDistance) * nearest.t
}

/** Which step the traveller is currently on, given the route segment they're nearest to.
 * Steps are ordered and each one covers [its startCoordinateIndex, the next step's) — the
 * same coordinate indices ORS's own way_points refer to, so this is a direct comparison. */
export function currentStepIndex(steps: NavigationStep[], nearestSegmentIndex: number): number {
  let index = 0
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].startCoordinateIndex <= nearestSegmentIndex) index = i
    else break
  }
  return index
}

export function distanceToNextManeuverMeters(cumulative: number[], steps: NavigationStep[], stepIndex: number, progress: number): number {
  const nextStep = steps[stepIndex + 1]
  const maneuverCoordinateIndex = nextStep ? nextStep.startCoordinateIndex : cumulative.length - 1
  return Math.max(0, cumulative[maneuverCoordinateIndex] - progress)
}

export function distanceRemainingMeters(cumulative: number[], progress: number): number {
  return Math.max(0, cumulative[cumulative.length - 1] - progress)
}

export function isOffRoute(distanceFromRouteMeters: number): boolean {
  return distanceFromRouteMeters > OFF_ROUTE_THRESHOLD_METERS
}

export function hasArrived(distanceRemainingMetersValue: number): boolean {
  return distanceRemainingMetersValue <= ARRIVAL_THRESHOLD_METERS
}

export interface NavigationProgress {
  currentStepIndex: number
  distanceToNextManeuverMeters: number
  distanceRemainingMeters: number
  distanceFromRouteMeters: number
  isOffRoute: boolean
  hasArrived: boolean
  snappedPosition: GeoPoint
}

export function computeNavigationProgress(
  position: GeoPoint,
  coordinates: [number, number][],
  steps: NavigationStep[],
): NavigationProgress | undefined {
  const nearest = nearestPointOnRoute(position, coordinates)
  if (!nearest) return undefined

  const cumulative = cumulativeDistancesMeters(coordinates)
  const progress = progressMeters(cumulative, nearest)
  const stepIndex = currentStepIndex(steps, nearest.segmentIndex)
  const distanceRemaining = distanceRemainingMeters(cumulative, progress)

  return {
    currentStepIndex: stepIndex,
    distanceToNextManeuverMeters: distanceToNextManeuverMeters(cumulative, steps, stepIndex, progress),
    distanceRemainingMeters: distanceRemaining,
    distanceFromRouteMeters: nearest.distanceMeters,
    isOffRoute: isOffRoute(nearest.distanceMeters),
    hasArrived: hasArrived(distanceRemaining),
    snappedPosition: nearest.point,
  }
}
