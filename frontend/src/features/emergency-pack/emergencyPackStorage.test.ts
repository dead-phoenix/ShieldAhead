import { describe, expect, it } from 'vitest'
import { storageKeys } from '../../app/config/product'
import type { MapPlace } from '../map/model/mapTypes'
import { nearestPlaces } from './crisisPackSnapshot'
import { emptyEmergencyPackSnapshot, readEmergencyPack, saveEmergencyPack, defaultEmergencyPackPreferences } from './emergencyPackStorage'

function mapPlace(overrides: Partial<MapPlace>): MapPlace {
  return {
    id: 'wifi:1',
    sourceId: '1',
    source: 'wifi',
    kind: 'wifi',
    name: 'Harcourt Library',
    address: '1 High St',
    suburb: 'Harcourt',
    postcode: '3453',
    dataUpdatedAt: '2026-10-01T00:00:00.000Z',
    dataOrigin: 'network',
    ...overrides,
  }
}

describe('crisis pack place coordinates', () => {
  it('copies coordinates from the map places into the saved pack places', () => {
    const [place] = nearestPlaces([mapPlace({ latitude: -36.998, longitude: 144.263 })], 'wifi')
    expect(place).toMatchObject({ id: 'wifi:1', latitude: -36.998, longitude: 144.263 })
  })

  it('keeps finite coordinates when the pack is read back, and drops anything else', () => {
    window.localStorage.setItem(storageKeys.emergencyPack, JSON.stringify({
      preferences: defaultEmergencyPackPreferences,
      snapshot: {
        ...emptyEmergencyPackSnapshot(),
        wifi: [
          { id: 'a', name: 'With coordinates', address: '1 High St', latitude: -36.998, longitude: 144.263 },
          { id: 'b', name: 'Text coordinates', address: '2 High St', latitude: '-36.9', longitude: '144.2' },
          { id: 'c', name: 'Half coordinates', address: '3 High St', latitude: -36.9 },
          { id: 'd', name: 'Legacy place', detail: '4 High St · 0.5 km' },
        ],
      },
    }))

    const [withCoordinates, text, half, legacy] = readEmergencyPack().snapshot.wifi
    expect(withCoordinates).toMatchObject({ latitude: -36.998, longitude: 144.263 })
    expect(text).not.toHaveProperty('latitude')
    expect(half).not.toHaveProperty('latitude')
    expect(legacy).not.toHaveProperty('latitude')
  })

  it('round-trips coordinates through save and read', () => {
    const snapshot = {
      ...emptyEmergencyPackSnapshot(),
      support: [{ id: 's', name: 'Food bank', address: '15 Hargreaves St', latitude: -36.76, longitude: 144.28 }],
    }
    saveEmergencyPack({ preferences: defaultEmergencyPackPreferences, snapshot })
    expect(readEmergencyPack().snapshot.support[0]).toMatchObject({ latitude: -36.76, longitude: 144.28 })
  })
})
