import { describe, expect, it } from 'vitest'
import type { SupportService, WifiLocation } from '../../../data/contracts'
import {
  metadataOrigin,
  supportServiceToMapPlace,
  wifiLocationToMapPlace,
} from './mapPlaceAdapters'

describe('map place adapters', () => {
  it('namespaces a Wi-Fi id and keeps only fields present in the source record', () => {
    const location: WifiLocation = {
      id: 'shared-id',
      name: 'Library Wi-Fi',
      suburb: 'Bendigo',
      postcode: '3550',
      latitude: -36.758,
      longitude: 144.28,
      verificationStatus: 'confirmed',
      dataUpdatedAt: '2026-09-20T00:00:00.000Z',
    }

    expect(wifiLocationToMapPlace(location, 'network')).toEqual({
      id: 'wifi:shared-id',
      sourceId: 'shared-id',
      source: 'wifi',
      kind: 'wifi',
      name: 'Library Wi-Fi',
      suburb: 'Bendigo',
      postcode: '3550',
      latitude: -36.758,
      longitude: 144.28,
      verificationStatus: 'confirmed',
      dataUpdatedAt: '2026-09-20T00:00:00.000Z',
      dataOrigin: 'network',
    })
  })

  it('namespaces a support id and preserves inferred service types as information', () => {
    const service: SupportService = {
      id: 'shared-id',
      name: 'Community Centre',
      serviceTypes: ['Housing support'],
      suburb: 'Bendigo',
      postcode: '3550',
      availabilityStatus: 'not-confirmed',
      dataUpdatedAt: '2026-09-20T00:00:00.000Z',
    }

    expect(supportServiceToMapPlace(service, 'cache')).toMatchObject({
      id: 'support:shared-id',
      sourceId: 'shared-id',
      source: 'support',
      kind: 'support',
      serviceTypes: ['Housing support'],
      availabilityStatus: 'not-confirmed',
      dataOrigin: 'cache',
    })
  })

  it('treats cachedAt as a saved copy when dataOrigin is absent', () => {
    expect(metadataOrigin({
      version: '1',
      generatedAt: '2026-09-20T00:00:00.000Z',
      sourceName: 'Test',
      coverageAreas: ['3550'],
      limitations: [],
      cachedAt: '2026-09-21T00:00:00.000Z',
    })).toBe('cache')
  })
})

