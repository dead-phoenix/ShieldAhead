import { describe, expect, it } from 'vitest'
import type { OfflineServiceCategory } from '../../data/offlineData'
import { haversineKm, isWithinBbox, nearestByCategory } from './geo'

describe('isWithinBbox', () => {
  const bbox = [143.29, -37.59, 145.18, -35.86] as const

  it('includes points inside the box or within the buffer, and excludes the rest', () => {
    expect(isWithinBbox({ lat: -36.75, lng: 144.28 }, bbox)).toBe(true)
    expect(isWithinBbox({ lat: -37.65, lng: 144.28 }, bbox)).toBe(false)
    expect(isWithinBbox({ lat: -37.65, lng: 144.28 }, bbox, 0.1)).toBe(true)
    expect(isWithinBbox({ lat: -37.8132, lng: 144.9624 }, bbox, 0.1)).toBe(false)
    expect(isWithinBbox({ lat: Number.NaN, lng: 144.28 }, bbox, 0.1)).toBe(false)
  })
})

const BENDIGO = { lat: -36.757, lng: 144.2794 }
const CASTLEMAINE = { lat: -37.0636, lng: 144.2173 }
const ECHUCA = { lat: -36.1306, lng: 144.75 }

function record(id: string, category: OfflineServiceCategory, lat: number, lng: number) {
  return { id, category, lat, lng }
}

describe('haversineKm', () => {
  it('is zero for the same point', () => {
    expect(haversineKm(BENDIGO, BENDIGO)).toBe(0)
  })

  it('gives 111.19 km for one degree of latitude', () => {
    expect(haversineKm({ lat: -36, lng: 144 }, { lat: -37, lng: 144 })).toBeCloseTo(111.195, 2)
  })

  it('matches known distances between regional towns', () => {
    expect(haversineKm(BENDIGO, CASTLEMAINE)).toBeCloseTo(34.6, 0)
    expect(haversineKm(BENDIGO, ECHUCA)).toBeCloseTo(81.4, 0)
  })

  it('is symmetric', () => {
    expect(haversineKm(BENDIGO, ECHUCA)).toBeCloseTo(haversineKm(ECHUCA, BENDIGO), 10)
  })
})

describe('nearestByCategory', () => {
  const records = [
    record('h-echuca', 'hospital', ECHUCA.lat, ECHUCA.lng),
    record('h-castlemaine', 'hospital', CASTLEMAINE.lat, CASTLEMAINE.lng),
    record('h-bendigo', 'hospital', BENDIGO.lat, BENDIGO.lng),
    record('p-castlemaine', 'police', CASTLEMAINE.lat, CASTLEMAINE.lng),
    record('w-bad', 'wifi', Number.NaN, 144),
  ]

  it('groups by category and sorts nearest first', () => {
    const result = nearestByCategory(records, BENDIGO)
    expect(result.hospital?.map((r) => r.id)).toEqual(['h-bendigo', 'h-castlemaine', 'h-echuca'])
    expect(result.police?.map((r) => r.id)).toEqual(['p-castlemaine'])
    expect(result.hospital?.[0].distanceKm).toBe(0)
  })

  it('limits each category to n and defaults to 6', () => {
    const many = Array.from({ length: 10 }, (_, i) => record(`f-${i}`, 'fire', BENDIGO.lat + i * 0.01, BENDIGO.lng))
    expect(nearestByCategory(many, BENDIGO).fire).toHaveLength(6)
    expect(nearestByCategory(many, BENDIGO, 2).fire?.map((r) => r.id)).toEqual(['f-0', 'f-1'])
  })

  it('breaks distance ties by id so results are deterministic', () => {
    const tied = [record('b', 'fire', 1, 1), record('a', 'fire', 1, 1), record('c', 'fire', 1, 1)]
    expect(nearestByCategory(tied, { lat: 0, lng: 0 }).fire?.map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('skips records with invalid coordinates and categories with no valid records', () => {
    expect(nearestByCategory(records, BENDIGO).wifi).toBeUndefined()
  })

  it('returns nothing for an invalid origin or non-positive n', () => {
    expect(nearestByCategory(records, { lat: Number.NaN, lng: 0 })).toEqual({})
    expect(nearestByCategory(records, BENDIGO, 0)).toEqual({})
  })

  it('does not mutate the input records', () => {
    const input = [record('x', 'fire', 1, 1)]
    nearestByCategory(input, { lat: 0, lng: 0 })
    expect(input[0]).not.toHaveProperty('distanceKm')
  })
})
