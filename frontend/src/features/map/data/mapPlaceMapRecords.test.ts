import { describe, expect, it } from 'vitest'
import { mapPlaceHasCoordinates, mapPlacesToMapRecords } from './mapPlaceMapRecords'
import type { MapPlace } from '../model/mapTypes'

const basePlace: MapPlace = {
  id: 'support:1',
  sourceId: '1',
  source: 'support',
  kind: 'support',
  name: 'Community service',
  dataUpdatedAt: '2026-09-30T00:00:00.000Z',
  dataOrigin: 'network',
}

describe('Map place records', () => {
  it('keeps coordinate-free places out of markers without treating them as invalid list records', () => {
    expect(mapPlaceHasCoordinates(basePlace)).toBe(false)
    expect(mapPlacesToMapRecords([basePlace])).toEqual([])
  })

  it('accepts valid coordinates and rejects coordinates outside world bounds', () => {
    const valid = { ...basePlace, latitude: -36.75, longitude: 144.28 }
    const invalid = { ...basePlace, id: 'support:2', latitude: -91, longitude: 144.28 }
    expect(mapPlaceHasCoordinates(valid)).toBe(true)
    expect(mapPlaceHasCoordinates(invalid)).toBe(false)
    expect(mapPlacesToMapRecords([valid, invalid])).toHaveLength(1)
  })
})
