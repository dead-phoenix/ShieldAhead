import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CURRENT_LOCATION_LABEL,
  readOfflineRoute,
  removeGpsStartedRoutes,
  routeStartedFromGps,
  saveOfflineRoute,
  type SavedOfflineRoute,
} from './offlineRouteStorage'

const STORAGE_KEY = 'shieldahead.map.offlineRoutes.v1'

const baseEntry: Omit<SavedOfflineRoute, 'savedAt'> = {
  destinationId: 'place-1',
  destinationName: 'Kilmore District Hospital',
  destinationLatitude: -37.3,
  destinationLongitude: 144.9,
  profile: 'foot-walking',
  origin: { latitude: -37.31, longitude: 144.91 },
  originLabel: '12 Sydney Street, Kilmore',
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
    expect(saveOfflineRoute(baseEntry)).toBe(true)
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
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([{ not: 'valid' }]))
    expect(readOfflineRoute('place-1')).toBeUndefined()
  })
})

describe('routes that start at the current location', () => {
  const gpsEntry = { ...baseEntry, originLabel: CURRENT_LOCATION_LABEL }
  // A reroute keeps the original label but starts where the device was, far from the stored origin.
  const reroutedEntry = {
    ...baseEntry,
    route: { ...baseEntry.route, coordinates: [[144.95, -37.35], [144.9, -37.3]] as Array<[number, number]> },
  }

  it('detects a route started with "Use my location"', () => {
    expect(routeStartedFromGps(gpsEntry)).toBe(true)
  })

  it('detects a reroute whose first point is far from the chosen start', () => {
    expect(routeStartedFromGps(reroutedEntry)).toBe(true)
  })

  it('treats a route from a typed address as not GPS-started', () => {
    expect(routeStartedFromGps(baseEntry)).toBe(false)
  })

  it('refuses to save a GPS-started route', () => {
    expect(saveOfflineRoute(gpsEntry)).toBe(false)
    expect(saveOfflineRoute(reroutedEntry)).toBe(false)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('removes already-saved GPS-started routes and keeps the rest', () => {
    const savedAt = '2026-10-01T00:00:00.000Z'
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([
      { ...gpsEntry, destinationId: 'gps', savedAt },
      { ...reroutedEntry, destinationId: 'rerouted', savedAt },
      { ...baseEntry, destinationId: 'typed', savedAt },
    ]))

    expect(removeGpsStartedRoutes()).toBe(2)
    expect(readOfflineRoute('gps')).toBeUndefined()
    expect(readOfflineRoute('rerouted')).toBeUndefined()
    expect(readOfflineRoute('typed')).toBeDefined()
    expect(removeGpsStartedRoutes()).toBe(0)
  })
})
