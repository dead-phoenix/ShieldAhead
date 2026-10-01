export type DirectionsProfile = 'foot-walking' | 'driving-car' | 'cycling-regular'

export interface RoutePoint {
  latitude: number
  longitude: number
}

export interface RoutePreview {
  distanceMeters: number
  durationSeconds: number
  coordinates: [number, number][]
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

export async function getDirections(
  start: RoutePoint,
  end: RoutePoint,
  profile: DirectionsProfile,
): Promise<RoutePreview> {
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
      }),
      signal: controller.signal,
    })
    const payload = await readJson(response)
    if (!response.ok) {
      throw new Error(messageForStatus(response.status))
    }
    if (!payload) {
      throw new Error(DIRECTIONS_ERROR.invalidRoute)
    }

    const geometry = payload.geometry as { type?: unknown; coordinates?: unknown } | undefined
    if (geometry?.type !== 'LineString' || !Array.isArray(geometry.coordinates)) {
      throw new Error(DIRECTIONS_ERROR.invalidRoute)
    }
    const coordinates = geometry.coordinates.filter((point): point is [number, number] => (
      Array.isArray(point)
      && point.length >= 2
      && typeof point[0] === 'number'
      && typeof point[1] === 'number'
    ))
    if (coordinates.length < 2) throw new Error(DIRECTIONS_ERROR.incompleteRoute)

    return {
      distanceMeters: Number(payload.distance_meters),
      durationSeconds: Number(payload.duration_seconds),
      coordinates,
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
