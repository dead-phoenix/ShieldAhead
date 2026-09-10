import { describe, expect, it } from 'vitest'
import type { WifiLocation } from '../../../data/contracts'
import {
  selectWifiLocationsForList,
  sortWifiLocations,
  WIFI_LIST_LIMIT,
} from './sortWifiLocations'

const near: WifiLocation = {
  id: 'near',
  name: 'Near place',
  address: '1 Example Street',
  suburb: 'Harcourt',
  postcode: '3453',
  distanceKm: 0.8,
  dataUpdatedAt: '2026-08-27T09:42:00.000Z',
}

const far: WifiLocation = {
  ...near,
  id: 'far',
  name: 'Far place',
  distanceKm: 12,
}

const nearbyLikely: WifiLocation = {
  ...near,
  id: 'nearby-likely',
  name: 'Nearby library',
  distanceKm: 14,
  verificationStatus: 'likely',
}

const fartherConfirmed: WifiLocation = {
  ...near,
  id: 'farther-confirmed',
  name: 'Confirmed hotspot',
  distanceKm: 19,
  verificationStatus: 'confirmed',
}

describe('sortWifiLocations', () => {
  it('pins the usual spot above a nearer record', () => {
    expect(sortWifiLocations([near, far], 'far').map(({ id }) => id)).toEqual([
      'far',
      'near',
    ])
  })

  it('returns to distance order after the usual spot is removed', () => {
    expect(sortWifiLocations([far, near], null).map(({ id }) => id)).toEqual([
      'near',
      'far',
    ])
  })

  it('ranks nearer likely listings above farther confirmed listings', () => {
    expect(
      sortWifiLocations([nearbyLikely, fartherConfirmed], null).map(({ id }) => id),
    ).toEqual(['nearby-likely', 'farther-confirmed'])
  })

  it('keeps nearer confirmed spots ahead of farther confirmed spots', () => {
    const nearerConfirmed = { ...fartherConfirmed, id: 'nearer-confirmed', distanceKm: 18 }

    expect(
      sortWifiLocations([fartherConfirmed, nearerConfirmed], null).map(({ id }) => id),
    ).toEqual(['nearer-confirmed', 'farther-confirmed'])
  })
})

describe('selectWifiLocationsForList', () => {
  it('keeps only the nearest 10 listings after ranking', () => {
    const records = Array.from({ length: 12 }, (_, index) => ({
      ...fartherConfirmed,
      id: `confirmed-${index}`,
      distanceKm: index + 1,
    }))

    expect(selectWifiLocationsForList(records, null)).toHaveLength(WIFI_LIST_LIMIT)
    expect(selectWifiLocationsForList(records, null).map(({ id }) => id)).toEqual(
      records.slice(0, WIFI_LIST_LIMIT).map(({ id }) => id),
    )
  })
})
