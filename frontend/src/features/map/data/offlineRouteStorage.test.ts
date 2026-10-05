import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readOfflineRoute, saveOfflineRoute, type SavedOfflineRoute } from './offlineRouteStorage'

const baseEntry: Omit<SavedOfflineRoute, 'savedAt'> = {
  destinationId: 'place-1',
  destinationName: 'Kilmore District Hospital',
  destinationLatitude: -37.3,
  destinationLongitude: 144.9,
  profile: 'foot-walking',
  origin: { latitude: -37.31, longitude: 144.91 },
  originLabel: 'Your current location',
  route: {
    distanceMeters: 1200,
    durationSeconds: 900,
    coordinates: [[144.91, -37.31], [144.9, -37.3]],
    steps: [],
    disclaimer: 'Standard route only.',
  },
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('offlineRouteStorage', () => {
  it('returns undefined for a destination with nothing saved', () => {
    expect(readOfflineRoute('unknown')).toBeUndefined()
  })

  it('saves and reads back a route for its destination', () => {
    saveOfflineRoute(baseEntry)
    const saved = readOfflineRoute('place-1')
    expect(saved?.destinationName).toBe('Kilmore District Hospital')
    expect(saved?.route.distanceMeters).toBe(1200)
    expect(typeof saved?.savedAt).toBe('string')
  })

  it('overwrites the previous save for the same destination rather than duplicating it', () => {
    saveOfflineRoute(baseEntry)
    saveOfflineRoute({ ...baseEntry, route: { ...baseEntry.route, distanceMeters: 999 } })
    expect(readOfflineRoute('place-1')?.route.distanceMeters).toBe(999)
  })

  it('keeps routes for different destinations independently', () => {
    saveOfflineRoute(baseEntry)
    saveOfflineRoute({ ...baseEntry, destinationId: 'place-2', destinationName: 'Local Food Bank' })
    expect(readOfflineRoute('place-1')?.destinationName).toBe('Kilmore District Hospital')
    expect(readOfflineRoute('place-2')?.destinationName).toBe('Local Food Bank')
  })

  it('caps the number of saved routes, evicting the oldest first', () => {
    for (let i = 0; i < 7; i += 1) {
      saveOfflineRoute({ ...baseEntry, destinationId: `place-${i}` })
    }
    // Oldest two (place-0, place-1) should have been evicted by the cap of 5.
    expect(readOfflineRoute('place-0')).toBeUndefined()
    expect(readOfflineRoute('place-1')).toBeUndefined()
    expect(readOfflineRoute('place-6')).toBeDefined()
  })

  it('does not throw when localStorage is unavailable', () => {
    const spy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    expect(() => saveOfflineRoute(baseEntry)).not.toThrow()
    spy.mockRestore()
  })

  it('ignores malformed data already in storage', () => {
    window.localStorage.setItem('shieldahead.map.offlineRoutes.v1', JSON.stringify([{ not: 'valid' }]))
    expect(readOfflineRoute('place-1')).toBeUndefined()
  })
})
