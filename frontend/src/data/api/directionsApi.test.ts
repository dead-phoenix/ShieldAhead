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
  it('normalises valid backend route alternatives', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({
      routes: [
        {
          distance_meters: 1250,
          duration_seconds: 900,
          geometry: { type: 'LineString', coordinates: [[144.96, -37.81], [144.97, -37.82]] },
          steps: [
            {
              distance_meters: 1250,
              duration_seconds: 900,
              maneuver_type: 11,
              instruction: 'Head east',
              street_name: '-',
              way_points: [0, 1],
            },
          ],
        },
        {
          distance_meters: 1400,
          duration_seconds: 860,
          geometry: { type: 'LineString', coordinates: [[144.96, -37.81], [144.965, -37.815], [144.97, -37.82]] },
        },
      ],
      disclaimer: 'Standard route only.',
    }, 200))
    vi.stubGlobal('fetch', fetcher)

    const alternatives = await getDirections(start, end, 'foot-walking')

    expect(alternatives).toEqual({
      routes: [
        {
          distanceMeters: 1250,
          durationSeconds: 900,
          coordinates: [[144.96, -37.81], [144.97, -37.82]],
          steps: [
            { distanceMeters: 1250, durationSeconds: 900, maneuverType: 11, instruction: 'Head east', streetName: undefined, startCoordinateIndex: 0 },
          ],
        },
        { distanceMeters: 1400, durationSeconds: 860, coordinates: [[144.96, -37.81], [144.965, -37.815], [144.97, -37.82]], steps: [] },
      ],
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
