import { describe, expect, it } from 'vitest'
import type { NavigationStep } from '../../data/api/directionsApi'
import {
  computeNavigationProgress,
  cumulativeDistancesMeters,
  currentStepIndex,
  distanceRemainingMeters,
  distanceToNextManeuverMeters,
  hasArrived,
  haversineMeters,
  isOffRoute,
  nearestPointOnRoute,
  progressMeters,
} from './liveNavigationMath'

// A straight west->east line along latitude -37.8136, roughly 500m apart
// per point — simple enough to reason about exact expected distances.
const STRAIGHT_ROUTE: [number, number][] = [
  [144.9600, -37.8136],
  [144.9660, -37.8136],
  [144.9720, -37.8136],
]

const STEPS: NavigationStep[] = [
  { distanceMeters: 500, durationSeconds: 60, maneuverType: 11, instruction: 'Head east', startCoordinateIndex: 0 },
  { distanceMeters: 500, durationSeconds: 60, maneuverType: 1, instruction: 'Turn right onto X St', streetName: 'X St', startCoordinateIndex: 1 },
]

describe('haversineMeters', () => {
  it('returns 0 for identical points', () => {
    expect(haversineMeters({ latitude: -37.8136, longitude: 144.9631 }, { latitude: -37.8136, longitude: 144.9631 })).toBe(0)
  })

  it('matches a known real-world distance within a small tolerance', () => {
    // Flinders Street Station to Southern Cross Station, Melbourne — ~1.3km.
    const distance = haversineMeters(
      { latitude: -37.8183, longitude: 144.9671 },
      { latitude: -37.8183, longitude: 144.9524 },
    )
    expect(distance).toBeGreaterThan(1000)
    expect(distance).toBeLessThan(1600)
  })
})

describe('nearestPointOnRoute', () => {
  it('snaps a point sitting exactly on the route to itself with ~0 distance', () => {
    const onRoute = { latitude: -37.8136, longitude: 144.9660 }
    const nearest = nearestPointOnRoute(onRoute, STRAIGHT_ROUTE)
    expect(nearest).toBeDefined()
    expect(nearest!.distanceMeters).toBeLessThan(1)
  })

  it('finds the correct segment and a non-zero distance for an off-route point', () => {
    const offRoute = { latitude: -37.8150, longitude: 144.9630 }
    const nearest = nearestPointOnRoute(offRoute, STRAIGHT_ROUTE)
    expect(nearest).toBeDefined()
    expect(nearest!.segmentIndex).toBe(0)
    expect(nearest!.distanceMeters).toBeGreaterThan(100)
  })

  it('returns undefined for a route with fewer than two points', () => {
    expect(nearestPointOnRoute({ latitude: 0, longitude: 0 }, [[0, 0]])).toBeUndefined()
  })
})

describe('cumulativeDistancesMeters / progressMeters', () => {
  it('starts at zero and increases monotonically to the total route length', () => {
    const cumulative = cumulativeDistancesMeters(STRAIGHT_ROUTE)
    expect(cumulative[0]).toBe(0)
    expect(cumulative[1]).toBeGreaterThan(400)
    expect(cumulative[2]).toBeGreaterThan(cumulative[1])
  })

  it('computes progress partway along a segment as roughly halfway between its endpoints', () => {
    const cumulative = cumulativeDistancesMeters(STRAIGHT_ROUTE)
    const nearest = nearestPointOnRoute({ latitude: -37.8136, longitude: 144.9630 }, STRAIGHT_ROUTE)
    const progress = progressMeters(cumulative, nearest!)
    expect(progress).toBeGreaterThan(cumulative[0])
    expect(progress).toBeLessThan(cumulative[1])
  })
})

describe('currentStepIndex', () => {
  it('attributes the first segment to the first step', () => {
    expect(currentStepIndex(STEPS, 0)).toBe(0)
  })

  it('switches to the next step once past its starting coordinate', () => {
    expect(currentStepIndex(STEPS, 1)).toBe(1)
  })

  it('defaults to the last applicable step when steps is empty', () => {
    expect(currentStepIndex([], 0)).toBe(0)
  })
})

describe('distanceToNextManeuverMeters / distanceRemainingMeters', () => {
  it('reports the full first-step length when standing at the route start', () => {
    const cumulative = cumulativeDistancesMeters(STRAIGHT_ROUTE)
    const toManeuver = distanceToNextManeuverMeters(cumulative, STEPS, 0, 0)
    expect(toManeuver).toBeCloseTo(cumulative[1], 0)
  })

  it('reports zero remaining distance once progress reaches the route end', () => {
    const cumulative = cumulativeDistancesMeters(STRAIGHT_ROUTE)
    expect(distanceRemainingMeters(cumulative, cumulative[cumulative.length - 1])).toBe(0)
  })

  it('never goes negative when progress slightly overshoots a coordinate due to GPS noise', () => {
    const cumulative = cumulativeDistancesMeters(STRAIGHT_ROUTE)
    expect(distanceRemainingMeters(cumulative, cumulative[cumulative.length - 1] + 5)).toBe(0)
  })
})

describe('isOffRoute / hasArrived', () => {
  it('flags distances beyond the off-route threshold', () => {
    expect(isOffRoute(51)).toBe(true)
    expect(isOffRoute(49)).toBe(false)
  })

  it('flags arrival once within the arrival threshold', () => {
    expect(hasArrived(19)).toBe(true)
    expect(hasArrived(21)).toBe(false)
  })
})

describe('computeNavigationProgress', () => {
  it('combines snapping, step detection and distance maths for a point near the route start', () => {
    const progress = computeNavigationProgress({ latitude: -37.8136, longitude: 144.9605 }, STRAIGHT_ROUTE, STEPS)
    expect(progress).toBeDefined()
    expect(progress!.currentStepIndex).toBe(0)
    expect(progress!.isOffRoute).toBe(false)
    expect(progress!.hasArrived).toBe(false)
    expect(progress!.distanceRemainingMeters).toBeGreaterThan(0)
  })

  it('flags off-route for a point far from the whole line', () => {
    const progress = computeNavigationProgress({ latitude: -37.83, longitude: 144.96 }, STRAIGHT_ROUTE, STEPS)
    expect(progress!.isOffRoute).toBe(true)
  })

  it('flags arrival for a point at the final coordinate', () => {
    const [lng, lat] = STRAIGHT_ROUTE[STRAIGHT_ROUTE.length - 1]
    const progress = computeNavigationProgress({ latitude: lat, longitude: lng }, STRAIGHT_ROUTE, STEPS)
    expect(progress!.hasArrived).toBe(true)
  })

  it('returns undefined for a degenerate route', () => {
    expect(computeNavigationProgress({ latitude: 0, longitude: 0 }, [[0, 0]], [])).toBeUndefined()
  })
})
