import type { OfflineDataBundle } from '../data/offline/offlineDataLoader'
import type {
  LocalityRecord,
  OfflineDataFile,
  OfflineRegion,
  OfflineServiceRecord,
  PostcodeRecord,
} from '../data/offlineData'

export const fixtureRegion: OfflineRegion = {
  id: 'loddon-campaspe',
  name: 'Loddon Campaspe',
  lgas: [],
  bbox: [143.29, -37.59, 145.18, -35.86],
}

function service(overrides: Partial<OfflineServiceRecord> & Pick<OfflineServiceRecord, 'id' | 'category' | 'name' | 'lat' | 'lng'>): OfflineServiceRecord {
  return {
    address: null,
    suburb: null,
    postcode: null,
    locationPrecision: 'feature',
    phone: null,
    website: null,
    serviceTypes: [],
    verification: null,
    sourceId: 'vicmap-foi',
    ...overrides,
  }
}

export const fixtureEmergency = [
  service({ id: 'h-bendigo', category: 'hospital', name: 'Bendigo Hospital', address: '100 Barnard Street', suburb: 'Bendigo', postcode: '3550', lat: -36.7528, lng: 144.2797 }),
  service({ id: 'p-bendigo', category: 'police', name: 'Bendigo Police Station', suburb: 'Bendigo', postcode: '3550', lat: -36.758, lng: 144.28 }),
  service({ id: 'f-harcourt', category: 'fire', name: 'Harcourt Fire Station', suburb: 'Harcourt', postcode: '3453', lat: -36.99, lng: 144.26 }),
  service({ id: 'a-castlemaine', category: 'ambulance', name: 'Castlemaine Ambulance Station', suburb: 'Castlemaine', postcode: '3450', lat: -37.06, lng: 144.21 }),
]

export const fixtureWifi = [
  service({ id: 'w-gallery', category: 'wifi', name: 'Art Gallery', suburb: 'Bendigo', postcode: '3550', lat: -36.7577, lng: 144.2769, verification: 'confirmed', sourceId: 'vicfreewifi' }),
]

export const fixtureCharities = [
  service({ id: 'c-food', category: 'charity', name: 'Bendigo Food Share', suburb: 'Bendigo', postcode: '3550', lat: -36.76, lng: 144.28, locationPrecision: 'street', verification: 'not-confirmed', sourceId: 'acnc' }),
]

export const fixturePostcodes: PostcodeRecord[] = [
  { id: '3550', postcode: '3550', lat: -36.76, lng: 144.28 },
  { id: '3453', postcode: '3453', lat: -36.98, lng: 144.25 },
  { id: '3000', postcode: '3000', lat: -37.8132, lng: 144.9624 },
]

export const fixtureLocalities: LocalityRecord[] = [
  { id: 'loc-harcourt', name: 'Harcourt', postcodes: ['3453'], lat: -36.9934, lng: 144.2583 },
  { id: 'loc-harcourt-north', name: 'Harcourt North', postcodes: ['3453'], lat: -36.9511, lng: 144.2763 },
  { id: 'loc-bendigo', name: 'Bendigo', postcodes: ['3550'], lat: -36.757, lng: 144.2795 },
  { id: 'loc-elmore', name: 'Elmore', postcodes: ['3558'], lat: -36.49, lng: 144.61 },
]

function file<T>(dataVersion: string, records: T[], region: OfflineRegion = fixtureRegion): OfflineDataFile<T> {
  return {
    schemaVersion: 1,
    dataVersion,
    generatedAt: '2026-10-08T05:00:00Z',
    region,
    notes: [],
    sources: [{
      id: 'vicmap-foi',
      name: 'Vicmap',
      url: 'https://example.test',
      retrievedAt: '2026-10-08',
      sourceUpdatedAt: null,
      licence: 'CC BY 4.0',
      licenceUrl: 'https://example.test/licence',
      attribution: '© State of Victoria',
    }],
    records,
  }
}

export const fixtureFiles = {
  'offline-wifi.json': file('wifi1', fixtureWifi),
  'offline-charities.json': file('char1', fixtureCharities),
  'offline-emergency-services.json': file('emer1', fixtureEmergency),
  'postcodes.json': file('post1', fixturePostcodes, { id: 'vic', name: 'Victoria', lgas: [], bbox: [140.9, -39.25, 150.05, -33.95] }),
  'localities.json': file('loc1', fixtureLocalities),
} as const

export function fixtureBundle(): OfflineDataBundle {
  return {
    wifi: fixtureFiles['offline-wifi.json'],
    charities: fixtureFiles['offline-charities.json'],
    emergencyServices: fixtureFiles['offline-emergency-services.json'],
    postcodes: fixtureFiles['postcodes.json'],
    localities: fixtureFiles['localities.json'],
    dataVersion: 'wifi1.char1.emer1.post1.loc1',
  }
}

/** A fetch stub that serves the fixture files from /data/ and records every requested URL. */
export function fixtureFetch(requested: string[] = []) {
  return async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input)
    requested.push(url)
    const name = url.split('/data/')[1] as keyof typeof fixtureFiles | undefined
    const body = name ? fixtureFiles[name] : undefined
    return body
      ? new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
      : new Response('Not found', { status: 404 })
  }
}

export const HARCOURT_POINT = { lat: -36.99, lng: 144.26 }
export const SYDNEY_POINT = { lat: -33.87, lng: 151.21 }
