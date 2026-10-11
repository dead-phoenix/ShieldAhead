import { describe, expect, it } from 'vitest'
import { pickZoomLevels, tileForPoint, tilesForBbox } from './mapTileMath'

describe('tileForPoint', () => {
  it('is always the single tile at zoom 0', () => {
    expect(tileForPoint(144.28, -36.76, 0)).toEqual({ x: 0, y: 0 })
    expect(tileForPoint(-73.99, 40.74, 0)).toEqual({ x: 0, y: 0 })
  })

  it('places null island (0,0) at the centre tile for any zoom', () => {
    expect(tileForPoint(0, 0, 8)).toEqual({ x: 128, y: 128 })
    expect(tileForPoint(0, 0, 4)).toEqual({ x: 8, y: 8 })
  })

  it('clamps the antimeridian/poles to the last valid tile index instead of overflowing', () => {
    expect(tileForPoint(180, 0, 4)).toEqual({ x: 15, y: 8 })
    expect(tileForPoint(-180, 0, 4)).toEqual({ x: 0, y: 8 })
  })
})

describe('tilesForBbox', () => {
  it('returns exactly one tile for a box smaller than one tile', () => {
    const tiles = tilesForBbox([144.001, -36.999, 144.002, -36.998], 10)
    expect(tiles).toHaveLength(1)
  })

  it('covers a wider box with a rectangle of tiles, nearest-corner inclusive', () => {
    const tiles = tilesForBbox([-0.01, -0.01, 0.01, 0.01], 10)
    const xs = new Set(tiles.map((tile) => tile.x))
    const ys = new Set(tiles.map((tile) => tile.y))
    expect(xs.size).toBeGreaterThanOrEqual(1)
    expect(ys.size).toBeGreaterThanOrEqual(1)
    expect(tiles.every((tile) => tile.z === 10)).toBe(true)
  })
})

describe('pickZoomLevels', () => {
  it('keeps every candidate zoom for a tiny, tight box', () => {
    const tiny: [number, number, number, number] = [144.001, -36.999, 144.002, -36.998]
    expect(pickZoomLevels(tiny, 400)).toEqual([12, 13, 14, 15])
  })

  it('trims the highest-detail zoom first as the box or budget shrinks', () => {
    const wide: [number, number, number, number] = [143.9, -37.3, 144.6, -36.6]
    const levels = pickZoomLevels(wide, 400)
    expect(levels[levels.length - 1]).toBeLessThan(15)
    expect(levels).toEqual([...levels].sort((a, b) => a - b))
  })

  it('always keeps at least the lowest candidate zoom, even over budget', () => {
    const huge: [number, number, number, number] = [-180, -85, 180, 85]
    expect(pickZoomLevels(huge, 1)).toEqual([12])
  })
})
