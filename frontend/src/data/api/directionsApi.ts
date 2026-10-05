export type DirectionsProfile = 'foot-walking' | 'driving-car' | 'cycling-regular'

/** Facility kinds the backend will try to route via, if one is close
 * enough to the direct route — matches the two kinds the map's own filters
 * expose as a single active search ('hospital', or 'support' for charities). */
export type RouteViaKind = 'hospital' | 'support'

export interface RoutePoint {
  latitude: number
  longitude: number
}

export interface RouteViaPlace {
  name: string
  kind: RouteViaKind
}

// ORS's numeric maneuver type codes (ORS Directions API: 0 Left, 1 Right,
// 2 Sharp left, 3 Sharp right, 4 Slight left, 5 Slight right, 6 Straight,
// 7 Enter roundabout, 8 Exit roundabout, 9 U-turn, 10 Goal/Arrive, 11 Depart,
// 12 Keep left, 13 Keep right). Kept as the raw number rather than an enum
// so an unrecognised future code degrades to a generic turn icon instead of
// failing to parse.
export interface NavigationStep {
  distanceMeters: number
  durationSeconds: number
  maneuverType: number
  instruction: string
  streetName?: string
  /** Index of this step's starting point in the route's `coordinates` array. */
  startCoordinateIndex: number
}

export interface RouteOption {
  distanceMeters: number
  durationSeconds: number
  coordinates: [number, number][]
  steps: NavigationStep[]
  /** Present when this route was chosen to pass by a nearby hospital/charity
   * instead of being a plain alternative path. */
  viaPlace?: RouteViaPlace
}

export interface RoutePreview extends RouteOption {
  disclaimer: string
}

export interface RouteAlternatives {
  routes: RouteOption[]
  disclaimer: string
}

export const DIRECTIONS_ERROR = {
  invalidInput: 'That start or end point is not valid for routing. Choose two points in Victoria.',
  rateLimited: 'Too many route requests, please wait a moment',
  unavailable: 'Routing is temporarily unavailable',
  invalidRoute: 'The routing service returned an invalid route.',
  incompleteRoute: 'The routing service returned an incomplete route.',
  timeout: 'The route took too long to calculate. Try again.',
  unreachable: 'The routing service could not be reached. Check your connection and try again.',
  generic: 'A route could not be calculated.',
} as const

function apiUrl(): URL {
  const configuredOrigin = String(import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/$/, '')
  const origin = configuredOrigin || window.location.origin
  return new URL('/api/directions', `${origin}/`)
}

function messageForStatus(status: number): string {
  if (status === 400) return DIRECTIONS_ERROR.invalidInput
  if (status === 429) return DIRECTIONS_ERROR.rateLimited
  if (status === 502) return DIRECTIONS_ERROR.unavailable
  return DIRECTIONS_ERROR.generic
}

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const payload = await response.json() as unknown
    return typeof payload === 'object' && payload !== null && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

function normalizeStep(value: unknown, coordinateCount: number): NavigationStep | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const distanceMeters = Number(record.distance_meters)
  const durationSeconds = Number(record.duration_seconds)
  const maneuverType = Number(record.maneuver_type)
  const instruction = typeof record.instruction === 'string' ? record.instruction : ''
  const wayPoints = record.way_points
  const startCoordinateIndex = Array.isArray(wayPoints) ? Number(wayPoints[0]) : NaN
  if (
    !Number.isFinite(distanceMeters)
    || !Number.isFinite(durationSeconds)
    || !Number.isFinite(maneuverType)
    || !instruction
    || !Number.isInteger(startCoordinateIndex)
    || startCoordinateIndex < 0
    || startCoordinateIndex >= coordinateCount
  ) return null
  const streetName = typeof record.street_name === 'string' && record.street_name.trim() && record.street_name !== '-'
    ? record.street_name
    : undefined
  return { distanceMeters, durationSeconds, maneuverType, instruction, streetName, startCoordinateIndex }
}

function normalizeViaPlace(value: unknown): RouteViaPlace | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  const name = typeof record.name === 'string' ? record.name : ''
  const kind = record.kind
  if (!name || (kind !== 'hospital' && kind !== 'support')) return undefined
  return { name, kind }
}

function normalizeRouteOption(value: unknown): RouteOption | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const geometry = record.geometry as { type?: unknown; coordinates?: unknown } | undefined
  if (geometry?.type !== 'LineString' || !Array.isArray(geometry.coordinates)) return null
  const coordinates = geometry.coordinates.filter((point): point is [number, number] => (
    Array.isArray(point)
    && point.length >= 2
    && typeof point[0] === 'number'
    && typeof point[1] === 'number'
  ))
  if (coordinates.length < 2) return null
  const distanceMeters = Number(record.distance_meters)
  const durationSeconds = Number(record.duration_seconds)
  if (!Number.isFinite(distanceMeters) || !Number.isFinite(durationSeconds)) return null
  const steps = Array.isArray(record.steps)
    ? record.steps
      .map((step) => normalizeStep(step, coordinates.length))
      .filter((step): step is NavigationStep => step !== null)
    : []
  const viaPlace = normalizeViaPlace(record.via_place)
  return { distanceMeters, durationSeconds, coordinates, steps, ...(viaPlace ? { viaPlace } : {}) }
}

export async function getDirections(
  start: RoutePoint,
  end: RoutePoint,
  profile: DirectionsProfile,
  viaKind?: RouteViaKind,
): Promise<RouteAlternatives> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 20_000)

  try {
    const response = await fetch(apiUrl(), {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start: { lat: start.latitude, lng: start.longitude },
        end: { lat: end.latitude, lng: end.longitude },
        profile,
        ...(viaKind ? { viaKind } : {}),
      }),
      signal: controller.signal,
    })
    const payload = await readJson(response)
    if (!response.ok) {
      throw new Error(messageForStatus(response.status))
    }
    if (!payload || !Array.isArray(payload.routes)) {
      throw new Error(DIRECTIONS_ERROR.invalidRoute)
    }

    const routes = payload.routes.map(normalizeRouteOption).filter((route): route is RouteOption => route !== null)
    if (routes.length === 0) throw new Error(DIRECTIONS_ERROR.incompleteRoute)

    return {
      routes,
      disclaimer: typeof payload.disclaimer === 'string' ? payload.disclaimer : '',
    }
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === 'AbortError') {
      throw new Error(DIRECTIONS_ERROR.timeout, { cause: reason })
    }
    if (reason instanceof TypeError) {
      throw new Error(DIRECTIONS_ERROR.unreachable, { cause: reason })
    }
    throw reason
  } finally {
    window.clearTimeout(timeout)
  }
}
