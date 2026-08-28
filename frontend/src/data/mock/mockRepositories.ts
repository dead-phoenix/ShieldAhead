import type { DatasetMetadata } from '../contracts'
import type {
  SupportServiceRepository,
  WifiRepository,
} from '../repositories'

const prototypeMetadata: DatasetMetadata = {
  version: 'prototype-v2',
  generatedAt: '2026-08-27T09:42:00.000Z',
  sourceName: 'Frontend prototype — example records only',
  coverageAreas: ['Harcourt 3453', 'Castlemaine 3450'],
  limitations: [
    'These locations and services are fictional examples.',
    'Availability, opening hours and eligibility are not live or verified.',
  ],
}

export const mockWifiRepository: WifiRepository = {
  async list() {
    return {
      records: [
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
      ],
      metadata: prototypeMetadata,
    }
  },
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
