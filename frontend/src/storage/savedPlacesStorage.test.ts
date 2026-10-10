import { describe, expect, it } from 'vitest'
import { storageKeys } from '../app/config/product'
import {
  getSavedPlace,
  readSavedPlaces,
  removeSavedPlace,
  SAVED_PLACES_LIMIT,
  savePlace,
  type SavedPlaceInput,
} from './savedPlacesStorage'

function wifiPlace(id: string): SavedPlaceInput {
  return {
    key: `wifi:${id}`,
    kind: 'wifi',
    record: { id, placeType: 'wifi', name: `Wi-Fi ${id}`, suburb: 'Harcourt', dataUpdatedAt: '2026-09-01T00:00:00.000Z' },
  }
}

describe('saved places storage', () => {
  it('persists a saved place and reads it back', () => {
    expect(savePlace(wifiPlace('a'))).toBe('saved')

    const stored = JSON.parse(window.localStorage.getItem(storageKeys.savedPlaces) ?? '{}') as { version: number }
    expect(stored.version).toBe(1)
    expect(getSavedPlace('wifi:a')?.record.name).toBe('Wi-Fi a')
    expect(typeof getSavedPlace('wifi:a')?.savedAt).toBe('string')
  })

  it('removes a saved place', () => {
    savePlace(wifiPlace('a'))
    expect(removeSavedPlace('wifi:a')).toBe(true)
    expect(readSavedPlaces()).toEqual([])
  })

  it('never stores distance, origin or search text, even when given them', () => {
    const input = wifiPlace('a') as SavedPlaceInput & { record: Record<string, unknown> }
    savePlace({
      ...input,
      record: { ...input.record, distanceKm: 1.2, origin: { latitude: -37, longitude: 144 }, searchText: '12 Main Street' } as never,
    })

    const raw = window.localStorage.getItem(storageKeys.savedPlaces) ?? ''
    expect(raw).not.toContain('distance')
    expect(raw).not.toContain('origin')
    expect(raw).not.toContain('12 Main Street')
  })

  it('ignores stored data with an unknown version or invalid places', () => {
    window.localStorage.setItem(storageKeys.savedPlaces, JSON.stringify({ version: 2, places: [] }))
    expect(readSavedPlaces()).toEqual([])

    window.localStorage.setItem(storageKeys.savedPlaces, JSON.stringify({
      version: 1,
      places: [{ key: 'wifi:x', kind: 'wifi', savedAt: '2026-10-01T00:00:00.000Z', record: { name: 'No id' } }],
    }))
    expect(readSavedPlaces()).toEqual([])
  })

  it(`stops at ${SAVED_PLACES_LIMIT} places`, () => {
    for (let index = 0; index < SAVED_PLACES_LIMIT; index += 1) {
      expect(savePlace(wifiPlace(String(index)))).toBe('saved')
    }

    expect(savePlace(wifiPlace('one-more'))).toBe('full')
    expect(readSavedPlaces()).toHaveLength(SAVED_PLACES_LIMIT)
    expect(savePlace(wifiPlace('3'))).toBe('saved')
  })
})
