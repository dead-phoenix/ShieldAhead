import { beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeSupportServiceDataset } from '../api/apiSupportServiceRepository'
import type { OfflineServiceRecord } from '../offlineData'
import { loadOfflineDataFile } from './offlineDataLoader'
import { buildStaticSupportDataset, supportServiceFromOfflineCharity } from './staticSupportFallback'

vi.mock('./offlineDataLoader', () => ({ loadOfflineDataFile: vi.fn() }))

// Copied verbatim from public/data/offline-charities.json.
const windarring = {
  id: 'acnc-11868616092',
  category: 'charity',
  name: 'Windarring Limited',
  address: null,
  suburb: 'Kyneton',
  postcode: '3444',
  lat: -37.248,
  lng: 144.444,
  locationPrecision: 'street',
  phone: null,
  website: 'http://www.windarring.org.au/',
  serviceTypes: ['Financial counselling / hardship support'],
  verification: 'not-confirmed',
  sourceId: 'acnc',
} as unknown as OfflineServiceRecord

// The same charity as /api/charities returns it (fixture; the live API is never called).
const apiResponse = {
  records: [{
    id: 'acnc-11868616092',
    name: 'Windarring Limited',
    serviceTypes: ['Financial counselling / hardship support'],
    address: '24 Mollison Street',
    suburb: 'Kyneton',
    postcode: '3444',
    latitude: -37.2481,
    longitude: 144.4442,
    distanceKm: 2.1,
    website: 'http://www.windarring.org.au/',
    availabilityStatus: 'not-confirmed',
    dataUpdatedAt: '2026-10-01T00:00:00.000Z',
  }],
  metadata: {
    version: '1.0',
    generatedAt: '2026-10-01T00:00:00.000Z',
    sourceName: 'ACNC Registered Charities Register',
  },
}

const region = { id: 'loddon-campaspe', name: 'Loddon Campaspe', bbox: [143.29, -37.59, 145.18, -35.86] }

function file(records: unknown[]) {
  return { schemaVersion: 1, dataVersion: 'test', generatedAt: '2026-10-08T05:24:08Z', region, records }
}

describe('static support fallback', () => {
  beforeEach(() => {
    vi.mocked(loadOfflineDataFile).mockImplementation(async (name) => {
      if (name === 'offline-charities.json') return file([windarring]) as never
      if (name === 'postcodes.json') {
        return file([
          { postcode: '3444', lat: -37.25, lng: 144.45 },
          { postcode: '3000', lat: -37.81, lng: 144.96 },
        ]) as never
      }
      return file([]) as never
    })
  })

  it('maps an offline charity to the same id the API uses', () => {
    const fromStatic = supportServiceFromOfflineCharity(windarring, '2026-10-08T05:24:08Z', { lat: -37.25, lng: 144.45 })
    const fromApi = normalizeSupportServiceDataset(apiResponse).records[0]

    expect(fromStatic.id).toBe(fromApi.id)
    expect(fromStatic.name).toBe(fromApi.name)
    expect(fromStatic.address).toBeUndefined()
    expect(fromStatic.availabilityStatus).toBe('not-confirmed')
  })

  it('builds the nearest charities for an area inside the offline region', async () => {
    const dataset = await buildStaticSupportDataset({ postcode: '3444' }, 20)

    expect(dataset?.records.map(({ id }) => id)).toEqual(['acnc-11868616092'])
    expect(dataset?.records[0].distanceKm).toBeGreaterThanOrEqual(0)
  })

  it('returns nothing for an area outside the offline region', async () => {
    expect(await buildStaticSupportDataset({ postcode: '3000' }, 20)).toBeNull()
  })

  it('returns nothing when the offline files cannot be read', async () => {
    vi.mocked(loadOfflineDataFile).mockRejectedValue(new Error('offline'))
    expect(await buildStaticSupportDataset({ postcode: '3444' }, 20)).toBeNull()
  })
})
