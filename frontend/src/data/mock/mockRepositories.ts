import type { DatasetMetadata, SupportService, WifiLocation } from '../contracts'
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

const prototypeSupportRecords: SupportService[] = [
  {
    id: 'example-food-relief',
    name: 'Example Food Relief Service',
    serviceTypes: ['Food parcels', 'Financial counselling'],
    address: '123 Example Street',
    suburb: 'Harcourt',
    postcode: '3453',
    distanceKm: 1.2,
    phone: '03 5XXX XXXX',
    website: 'https://example.org/food-relief',
    eligibility: 'Referral not required. Check availability before visiting.',
    partnerStatus: 'partner',
    availabilityStatus: 'not-confirmed',
    availabilityUpdatedAt: '2026-08-27T09:20:00.000Z',
    availabilityFreshness: 'current',
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
    availabilityFreshness: 'current',
    dataUpdatedAt: '2026-08-27T09:42:00.000Z',
  },
]

function createSupportRepository(
  records: SupportService[],
  metadata: DatasetMetadata,
): SupportServiceRepository {
  return {
    async list() {
      return { records, metadata }
    },
  }
}

export type SupportFixtureName =
  | 'default'
  | 'long-content'
  | 'missing-fields'
  | 'no-nearby'
  | 'partner-states'
  | 'stale'

const supportFixtureRepositories: Record<SupportFixtureName, SupportServiceRepository> = {
  default: createSupportRepository(prototypeSupportRecords, prototypeMetadata),
  'missing-fields': createSupportRepository([
    {
      id: 'example-limited-support-record',
      name: 'Example Emergency Relief Service',
      serviceTypes: ['Emergency relief'],
      suburb: 'Harcourt',
      postcode: '3453',
      partnerStatus: 'unknown',
      availabilityStatus: 'not-confirmed',
      dataUpdatedAt: '2026-08-27T09:42:00.000Z',
    },
  ], {
    ...prototypeMetadata,
    version: 'prototype-support-missing-fields-v1',
    limitations: [
      ...prototypeMetadata.limitations,
      'Address, distance, phone, website and eligibility are unavailable in this fixture.',
    ],
  }),
  'no-nearby': createSupportRepository([], {
    ...prototypeMetadata,
    version: 'prototype-support-no-nearby-v1',
    limitations: [
      ...prototypeMetadata.limitations,
      'No prototype support services are listed near the selected postcode.',
    ],
  }),
  'partner-states': createSupportRepository([
    {
      ...prototypeSupportRecords[0],
      id: 'example-partner-normal',
      name: 'Example Partner — Normal Availability',
      availabilityStatus: 'normal',
      availabilityUpdatedAt: '2026-08-28T08:15:00.000Z',
    },
    {
      ...prototypeSupportRecords[0],
      id: 'example-partner-low',
      name: 'Example Partner — Low Availability',
      distanceKm: 2.4,
      availabilityStatus: 'low',
      availabilityUpdatedAt: '2026-08-28T08:10:00.000Z',
    },
    {
      ...prototypeSupportRecords[0],
      id: 'example-partner-closed',
      name: 'Example Partner — Closed',
      distanceKm: 4.8,
      availabilityStatus: 'closed',
      availabilityUpdatedAt: '2026-08-28T08:05:00.000Z',
    },
  ], {
    ...prototypeMetadata,
    version: 'prototype-support-partner-states-v1',
  }),
  stale: createSupportRepository([
    {
      ...prototypeSupportRecords[0],
      id: 'example-stale-partner-status',
      name: 'Example Service With Old Partner Update',
      availabilityStatus: 'normal',
      availabilityUpdatedAt: '2026-05-01T09:20:00.000Z',
      availabilityFreshness: 'stale',
    },
  ], {
    ...prototypeMetadata,
    version: 'prototype-support-stale-v1',
    generatedAt: '2026-05-01T09:42:00.000Z',
    freshnessStatus: 'stale',
  }),
  'long-content': createSupportRepository([
    {
      ...prototypeSupportRecords[0],
      id: 'example-long-content',
      name: 'Example Loddon Campaspe Community Food, Financial Counselling and Family Support Coordination Service',
      serviceTypes: ['Food parcels', 'Financial counselling', 'Family support coordination'],
      eligibility: 'A referral from a local health, housing or community worker is required for this example service. Households may receive assistance once every four weeks, subject to the service confirming eligibility and availability before each visit.',
      partnerStatus: 'open-referral',
    },
  ], {
    ...prototypeMetadata,
    version: 'prototype-support-long-content-v1',
  }),
}

export const mockSupportServiceRepository = supportFixtureRepositories.default

export function getMockSupportServiceRepository(
  fixture: string | null,
): SupportServiceRepository {
  if (fixture && Object.hasOwn(supportFixtureRepositories, fixture)) {
    return supportFixtureRepositories[fixture as SupportFixtureName]
  }
  return mockSupportServiceRepository
}
