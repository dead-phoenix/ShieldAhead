import { afterEach, describe, expect, it, vi } from 'vitest'
import { DIRECTIONS_ERROR, getDirections } from './directionsApi'

afterEach(() => vi.unstubAllGlobals())

const start = { latitude: -37.81, longitude: 144.96 }
const end = { latitude: -37.82, longitude: 144.97 }

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('getDirections', () => {
  it('normalises a valid backend route preview', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({
      distance_meters: 1250,
      duration_seconds: 900,
      geometry: { type: 'LineString', coordinates: [[144.96, -37.81], [144.97, -37.82]] },
      disclaimer: 'Standard route only.',
    }, 200))
    vi.stubGlobal('fetch', fetcher)

    const route = await getDirections(start, end, 'foot-walking')

    expect(route).toEqual({
      distanceMeters: 1250,
      durationSeconds: 900,
      coordinates: [[144.96, -37.81], [144.97, -37.82]],
      disclaimer: 'Standard route only.',
    })
    expect(fetcher).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ method: 'POST' }))
  })

  it('maps 400, 429 and 502 to fixed copy without leaking API error text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'raw backend 400' }, 400)))
    await expect(getDirections(start, end, 'driving-car')).rejects.toThrow(DIRECTIONS_ERROR.invalidInput)

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'raw backend 429' }, 429)))
    await expect(getDirections(start, end, 'driving-car')).rejects.toThrow(DIRECTIONS_ERROR.rateLimited)

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'routing service unavailable' }, 502)))
    await expect(getDirections(start, end, 'driving-car')).rejects.toThrow(DIRECTIONS_ERROR.unavailable)
  })
})
