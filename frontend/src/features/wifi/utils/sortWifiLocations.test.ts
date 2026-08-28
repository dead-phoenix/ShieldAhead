import { describe, expect, it } from 'vitest'
import type { WifiLocation } from '../../../data/contracts'
import { sortWifiLocations } from './sortWifiLocations'

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
})
