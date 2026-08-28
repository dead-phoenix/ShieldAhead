import type { DatasetMetadata, WifiLocation } from '../contracts'
import type {
  SupportServiceRepository,
  WifiRepository,
} from '../repositories'

const prototypeMetadata: DatasetMetadata = {
  version: 'prototype-v2',
  generatedAt: '2026-08-27T09:42:00.000Z',
  sourceName: 'Frontend prototype — example records only',
  coverageAreas: ['Harcourt 3453', 'Castlemaine 3450'],
  freshnessStatus: 'current',
  limitations: [
    'These locations and services are fictional examples.',
    'Availability, opening hours and eligibility are not live or verified.',
  ],
}

const prototypeWifiRecords: WifiLocation[] = [
  {
    id: 'example-harcourt',
    name: 'Example Harcourt Wi-Fi point',
    address: 'Example address',
    suburb: 'Harcourt',
    postcode: '3453',
    latitude: -36.999,
    longitude: 144.263,
    distanceKm: 0.8,
    openingHours: 'Hours not confirmed',
    accessConditions: [
      'Ask staff before connecting',
      'Indoor access may depend on opening hours',
    ],
    dataUpdatedAt: '2026-08-27T09:42:00.000Z',
  },
  {
    id: 'example-castlemaine',
    name: 'Example Castlemaine Wi-Fi point',
    address: '456 High Street',
    suburb: 'Castlemaine',
    postcode: '3450',
    distanceKm: 12,
    openingHours: 'Open until 6:00 pm (example)',
    accessConditions: ['Check conditions before travelling'],
    dataUpdatedAt: '2026-08-27T09:42:00.000Z',
  },
]

function createWifiRepository(
  records: WifiLocation[],
  metadata: DatasetMetadata,
): WifiRepository {
  return {
    async list() {
      return { records, metadata }
    },
  }
}

export type WifiFixtureName =
  | 'default'
  | 'missing-fields'
  | 'no-coverage'
  | 'removed-usual'
  | 'stale'

const wifiFixtureRepositories: Record<WifiFixtureName, WifiRepository> = {
  default: createWifiRepository(prototypeWifiRecords, prototypeMetadata),
  'missing-fields': createWifiRepository([
    {
      id: 'example-limited-record',
      name: 'Example public Wi-Fi location',
      suburb: 'Harcourt',
      postcode: '3453',
      dataUpdatedAt: '2026-08-27T09:42:00.000Z',
    },
  ], {
    ...prototypeMetadata,
    version: 'prototype-missing-fields-v1',
    limitations: [
      ...prototypeMetadata.limitations,
      'Address, distance, opening hours and access conditions are unavailable in this fixture.',
    ],
  }),
  'no-coverage': createWifiRepository([], {
    ...prototypeMetadata,
    version: 'prototype-no-coverage-v1',
    coverageAreas: [],
    limitations: [
      'No verified public Wi-Fi locations are available for this prototype area.',
      'A library is only a general fallback and Wi-Fi availability is not confirmed.',
    ],
  }),
  'removed-usual': createWifiRepository([prototypeWifiRecords[1]], {
    ...prototypeMetadata,
    version: 'prototype-after-refresh-v1',
    removedRecordIds: ['example-harcourt'],
  }),
  stale: createWifiRepository(prototypeWifiRecords, {
    ...prototypeMetadata,
    version: 'prototype-stale-v1',
    generatedAt: '2026-05-01T09:42:00.000Z',
    freshnessStatus: 'stale',
    limitations: [
      ...prototypeMetadata.limitations,
      'This fixture represents a saved copy that is overdue for refresh.',
    ],
  }),
}

export const mockWifiRepository = wifiFixtureRepositories.default

export function getMockWifiRepository(fixture: string | null): WifiRepository {
  if (fixture && Object.hasOwn(wifiFixtureRepositories, fixture)) {
    return wifiFixtureRepositories[fixture as WifiFixtureName]
  }
  return mockWifiRepository
}

export const mockSupportServiceRepository: SupportServiceRepository = {
  async list() {
    return {
      records: [
        {
          id: 'example-food-relief',
          name: 'Example Food Relief Service',
          serviceTypes: ['Food parcels', 'Financial counselling'],
          address: '123 Example Street',
          suburb: 'Harcourt',
          postcode: '3453',
          distanceKm: 1.2,
          phone: '03 5XXX XXXX',
          eligibility: 'Referral not required. Check availability before visiting.',
          partnerStatus: 'partner',
          availabilityStatus: 'not-confirmed',
          availabilityUpdatedAt: '2026-08-27T09:20:00.000Z',
          dataUpdatedAt: '2026-08-27T09:42:00.000Z',
        },
        {
          id: 'example-community-support',
          name: 'Example Community Support Service',
          serviceTypes: ['Emergency relief'],
          address: '233 Example Street',
          suburb: 'Harcourt',
          postcode: '3453',
          distanceKm: 3.5,
          phone: '03 5XXX XXXX',
          eligibility: 'Open visit may be possible. Call ahead each week.',
          partnerStatus: 'open-referral',
          availabilityStatus: 'not-confirmed',
          availabilityUpdatedAt: '2026-08-27T09:20:00.000Z',
          dataUpdatedAt: '2026-08-27T09:42:00.000Z',
        },
      ],
      metadata: prototypeMetadata,
    }
  },
}
