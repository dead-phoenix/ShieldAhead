import { describe, expect, it } from 'vitest'
import { CRISIS_PACK_MAP_SIZE, LEADER_LINE_MIN_PX, projectToFrame, scaleBarFor, spreadMarkers } from './crisisPackMapProjection'

const frame = { ...CRISIS_PACK_MAP_SIZE, padding: 56 }

describe('crisis pack map projection', () => {
  it('returns nothing for no points', () => {
    expect(projectToFrame([], frame)).toBeNull()
  })

  it('centres a single place and keeps a sensible scale', () => {
    const projection = projectToFrame([{ id: 'a', latitude: -36.998, longitude: 144.263 }], frame)!
    expect(projection.points[0].x).toBeCloseTo(frame.width / 2)
    expect(projection.points[0].y).toBeCloseTo(frame.height / 2)
    // The minimum 1 km span fills the padded height.
    expect(projection.metersPerPixel * (frame.height - 2 * frame.padding)).toBeCloseTo(1000, 0)
  })

  it('fits every point inside the padded frame with north up and east right', () => {
    const projection = projectToFrame([
      { id: 'north-west', latitude: -36.9, longitude: 144.1 },
      { id: 'south-east', latitude: -37.1, longitude: 144.4 },
      { id: 'middle', latitude: -37.0, longitude: 144.25 },
    ], frame)!
    for (const point of projection.points) {
      expect(point.x).toBeGreaterThanOrEqual(frame.padding - 0.001)
      expect(point.x).toBeLessThanOrEqual(frame.width - frame.padding + 0.001)
      expect(point.y).toBeGreaterThanOrEqual(frame.padding - 0.001)
      expect(point.y).toBeLessThanOrEqual(frame.height - frame.padding + 0.001)
    }
    const [northWest, southEast] = projection.points
    expect(northWest.x).toBeLessThan(southEast.x)
    expect(northWest.y).toBeLessThan(southEast.y)
  })

  it('picks the longest round scale-bar distance that fits', () => {
    expect(scaleBarFor(5, 180)).toEqual({ meters: 500, pixels: 100, label: '500 m' })
    expect(scaleBarFor(10, 180)).toEqual({ meters: 1000, pixels: 100, label: '1 km' })
    expect(scaleBarFor(100, 180).label).toBe('10 km')
    expect(scaleBarFor(0.01, 180).label).toBe('10 m')
  })

  it('leaves markers that do not overlap where they are', () => {
    const points = [{ id: 'a', x: 100, y: 100 }, { id: 'b', x: 300, y: 300 }]
    const spread = spreadMarkers(points, 40, frame)
    expect(spread.map(({ x, y, hasLeader }) => ({ x, y, hasLeader }))).toEqual([
      { x: 100, y: 100, hasLeader: false },
      { x: 300, y: 300, hasLeader: false },
    ])
  })

  it('pushes overlapping markers apart, inside the frame, with leader lines when they move far', () => {
    const points = [
      { id: 'a', x: 500, y: 300 },
      { id: 'b', x: 500, y: 300 },
      { id: 'c', x: 505, y: 302 },
      { id: 'd', x: 10, y: 10 },
    ]
    const spread = spreadMarkers(points, 40, frame)
    for (let i = 0; i < spread.length; i += 1) {
      for (let j = i + 1; j < spread.length; j += 1) {
        expect(Math.hypot(spread[i].x - spread[j].x, spread[i].y - spread[j].y)).toBeGreaterThan(38)
      }
      expect(spread[i].x).toBeGreaterThanOrEqual(20)
      expect(spread[i].y).toBeGreaterThanOrEqual(20)
    }
    expect(spread.slice(0, 3).some((point) => point.hasLeader)).toBe(true)
    for (const point of spread) {
      expect(point.hasLeader).toBe(Math.hypot(point.x - point.anchorX, point.y - point.anchorY) > LEADER_LINE_MIN_PX)
    }
    expect(spreadMarkers(points, 40, frame)).toEqual(spread)
  })
})
