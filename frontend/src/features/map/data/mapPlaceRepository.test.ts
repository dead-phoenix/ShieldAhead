import { describe, expect, it, vi } from 'vitest'
import type { DatasetMetadata } from '../../../data/contracts'
import type { SupportServiceRepository, WifiRepository } from '../../../data/repositories'
import type { MapPlace } from '../model/mapTypes'
import { createCombinedMapPlaceRepository, groupWifiAccessPoints } from './mapPlaceRepository'

// Without this, findNearby() fires a real, unmocked fetch() to the live
// Vicmap-backed /api/facilities endpoint on every test run — slow, flaky,
// and it returns real emergency-facility records that break assertions
// written as if only wifi/support were in play.
vi.mock('../../../data/api/facilitiesApi', () => ({
  fetchEmergencyFacilities: vi.fn().mockResolvedValue({
    records: [],
    metadata: {
      version: '1.0',
      generatedAt: '2026-01-01T00:00:00.000Z',
      sourceName: 'Vicmap Features of Interest',
      coverageAreas: [],
      limitations: [],
    },
  }),
}))

const metadata: DatasetMetadata = {
  version: '1',
  generatedAt: '2026-09-20T00:00:00.000Z',
  sourceName: 'Test source',
  coverageAreas: ['3550'],
  limitations: ['Test limitation'],
}

describe('combined map place repository', () => {
  it('combines Wi-Fi and support records without id collisions', async () => {
    const wifiRepository: WifiRepository = {
      async list() {
        return {
          metadata,
          records: [{
            id: 'same-id',
            name: 'Wi-Fi',
            suburb: 'Bendigo',
            postcode: '3550',
            dataUpdatedAt: '2026-09-20T00:00:00.000Z',
          }],
        }
      },
    }
    const supportRepository: SupportServiceRepository = {
      async list() {
        return {
          metadata: { ...metadata, dataOrigin: 'cache' },
          records: [{
            id: 'same-id',
            name: 'Support',
            serviceTypes: ['Community support services'],
            suburb: 'Bendigo',
            postcode: '3550',
            availabilityStatus: 'not-confirmed',
            dataUpdatedAt: '2026-09-20T00:00:00.000Z',
          }],
        }
      },
    }

    const result = await createCombinedMapPlaceRepository({
      wifiRepository,
      supportRepository,
      postcode: '3550',
    }).findNearby({ postcode: '3550' })

    expect(result.places.map(({ id }) => id)).toEqual([
      'wifi:same-id',
      'support:same-id',
    ])
    expect(result.dataOrigin).toBe('mixed')
    expect(result.datasets).toHaveLength(2)
  })

  it('returns one source with a plain-language error when the other fails', async () => {
    const wifiRepository: WifiRepository = {
      async list() {
        throw new Error('Wi-Fi is unavailable.')
      },
    }
    const supportRepository: SupportServiceRepository = {
      async list() {
        return { metadata, records: [] }
      },
    }

    const result = await createCombinedMapPlaceRepository({
      wifiRepository,
      supportRepository,
      postcode: '3550',
    }).findNearby({ postcode: '3550' })

    expect(result.places).toEqual([])
    expect(result.sourceErrors).toEqual([
      { source: 'wifi', message: 'Wi-Fi is unavailable.' },
    ])
  })

  it('fails only when every configured source fails', async () => {
    const wifiRepository: WifiRepository = {
      async list() {
        throw new Error('Wi-Fi is unavailable.')
      },
    }
    const supportRepository: SupportServiceRepository = {
      async list() {
        throw new Error('Support is unavailable.')
      },
    }

    await expect(createCombinedMapPlaceRepository({
      wifiRepository,
      supportRepository,
      postcode: '3550',
    }).findNearby({ postcode: '3550' })).rejects.toThrow(
      'Wi-Fi is unavailable. Support is unavailable.',
    )
  })
})


describe('groupWifiAccessPoints', () => {
  const wifi = (name: string, distanceKm: number): MapPlace => ({
    id: `wifi:${name}`,
    sourceId: name,
    source: 'wifi',
    kind: 'wifi',
    name,
    postcode: '3000',
    latitude: -37.818 + distanceKm / 100,
    longitude: 144.952,
    distanceKm,
    dataUpdatedAt: '2026-01-01',
    dataOrigin: 'network',
  })

  it('merges access points of one site into a single entry at the nearest point', () => {
    const grouped = groupWifiAccessPoints([
      wifi('Flinders Street Station - Concourse', 0.9),
      wifi('Flinders Street Station - ML_Platform1/2', 0.7),
      wifi('Flinders Street Station - ML_Platform3/4', 0.7),
      wifi('Tennis Australia - Melbourne Park', 0.5),
    ])

    expect(grouped).toHaveLength(2)
    const station = grouped.find((place) => place.name === 'Flinders Street Station')
    expect(station?.accessPoints).toHaveLength(3)
    expect(station?.distanceKm).toBe(0.7)
    expect(grouped.find((place) => place.name === 'Tennis Australia')?.accessPoints).toBeUndefined()
  })

  it('leaves non-wifi places untouched', () => {
    const hospital: MapPlace = { ...wifi('Hospital', 1), kind: 'hospital', source: 'emergency' }
    expect(groupWifiAccessPoints([hospital])).toEqual([hospital])
  })
})
