import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDirections } from './directionsApi'

afterEach(() => vi.unstubAllGlobals())

describe('getDirections', () => {
  it('normalises a valid backend route preview', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      distance_meters: 1250,
      duration_seconds: 900,
      geometry: { type: 'LineString', coordinates: [[144.96, -37.81], [144.97, -37.82]] },
      disclaimer: 'Standard route only.',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetcher)

    const route = await getDirections(
      { latitude: -37.81, longitude: 144.96 },
      { latitude: -37.82, longitude: 144.97 },
      'foot-walking',
    )

    expect(route).toEqual({
      distanceMeters: 1250,
      durationSeconds: 900,
      coordinates: [[144.96, -37.81], [144.97, -37.82]],
      disclaimer: 'Standard route only.',
    })
    expect(fetcher).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ method: 'POST' }))
  })

  it('uses a clear message when the route service is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: 'routing service unavailable',
    }), { status: 502, headers: { 'Content-Type': 'application/json' } })))

    await expect(getDirections(
      { latitude: -37.81, longitude: 144.96 },
      { latitude: -37.82, longitude: 144.97 },
      'driving-car',
    )).rejects.toThrow('routing service unavailable')
  })
})
