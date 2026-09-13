export type DirectionsProfile = 'foot-walking' | 'driving-car'

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

function apiUrl(): URL {
  const configuredOrigin = String(import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/$/, '')
  const origin = configuredOrigin || window.location.origin
  return new URL('/api/directions', `${origin}/`)
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
    const payload = await response.json() as Record<string, unknown>
    if (!response.ok) {
      if (response.status === 429) throw new Error('Too many route requests were made. Wait a moment and try again.')
      throw new Error(typeof payload.error === 'string' ? payload.error : 'A route could not be calculated.')
    }

    const geometry = payload.geometry as { type?: unknown; coordinates?: unknown } | undefined
    if (geometry?.type !== 'LineString' || !Array.isArray(geometry.coordinates)) {
      throw new Error('The routing service returned an invalid route.')
    }
    const coordinates = geometry.coordinates.filter((point): point is [number, number] => (
      Array.isArray(point)
      && point.length >= 2
      && typeof point[0] === 'number'
      && typeof point[1] === 'number'
    ))
    if (coordinates.length < 2) throw new Error('The routing service returned an incomplete route.')

    return {
      distanceMeters: Number(payload.distance_meters),
      durationSeconds: Number(payload.duration_seconds),
      coordinates,
      disclaimer: typeof payload.disclaimer === 'string' ? payload.disclaimer : '',
    }
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === 'AbortError') {
      throw new Error('The route took too long to calculate. Try again.', { cause: reason })
    }
    if (reason instanceof TypeError) {
      throw new Error('The routing service could not be reached. Check your connection and try again.', { cause: reason })
    }
    throw reason
  } finally {
    window.clearTimeout(timeout)
  }
}
