import { describe, expect, it } from 'vitest'
import { wifiAreaLabel, wifiMapsUrl } from './wifiMapsUrl'

describe('wifiMapsUrl', () => {
  it('opens maps at the hotspot coordinates when they are known', () => {
    expect(wifiMapsUrl({
      latitude: -37.548,
      longitude: 143.831,
      suburb: 'Ballarat',
      postcode: '3350',
    })).toBe('https://www.google.com/maps/search/?api=1&query=-37.548%2C143.831')
  })

  it('falls back to the area label when coordinates are missing', () => {
    expect(wifiMapsUrl({
      address: '456 High Street',
      suburb: 'Castlemaine',
      postcode: '3450',
    })).toContain(encodeURIComponent('456 High Street, Castlemaine VIC 3450'))
  })
})

describe('wifiAreaLabel', () => {
  it('does not treat a missing street address as a place name', () => {
    expect(wifiAreaLabel({
      suburb: 'Ballarat',
      postcode: '3350',
    })).toBe('Ballarat VIC 3350')
  })
})
