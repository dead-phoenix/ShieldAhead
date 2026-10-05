import { describe, expect, it } from 'vitest'
import type { MapPlace } from '../map/model/mapTypes'
import { clampPlaceText, packDisplayName, packPlaceAddress } from './crisisPackPlaceText'
import { nearestPlaces } from './crisisPackSnapshot'

function wifiPlace(id: string, name: string, distanceKm: number, address?: string): MapPlace {
  return {
    id: `wifi:${id}`,
    sourceId: id,
    source: 'wifi',
    kind: 'wifi',
    name,
    address,
    suburb: 'Melbourne',
    postcode: '3000',
    distanceKm,
    dataUpdatedAt: '2026-10-05T00:00:00.000Z',
    dataOrigin: 'network',
  }
}

describe('crisis pack place text', () => {
  it('collapses duplicate Wi-Fi rows before taking the nearest 5', () => {
    const places = [
      wifiPlace('1', 'HARBOUR ESP', 0.1),
      wifiPlace('2', 'HARBOUR ESP', 0.2),
      wifiPlace('3', 'Harbour Esp', 0.3),
      wifiPlace('4', 'HARBOUR ESP ', 0.4),
      ...['A', 'B', 'C', 'D', 'E'].map((letter, index) => wifiPlace(`x${letter}`, `Library ${letter}`, 1 + index)),
    ]
    const nearest = nearestPlaces(places, 'wifi')
    expect(nearest.map((place) => place.name)).toEqual(['HARBOUR ESP', 'Library A', 'Library B', 'Library C', 'Library D'])
  })

  it('title-cases names that are entirely upper case and leaves mixed case alone', () => {
    expect(packDisplayName('LIBRARY AT THE DOCK')).toBe('Library at the Dock')
    expect(packDisplayName('THE SALVATION ARMY PTY LTD')).toBe('The Salvation Army Pty Ltd')
    expect(packDisplayName('YMCA COMMUNITY HUB INC.')).toBe('YMCA Community Hub Inc.')
    expect(packDisplayName('NORTH-WEST FOOD BANK')).toBe('North-West Food Bank')
    expect(packDisplayName('Docklands HUB at VIC')).toBe('Docklands HUB at VIC')
  })

  it('collapses repeated suburb, state and postcode parts in an address', () => {
    expect(packPlaceAddress({
      name: 'Library at the Dock',
      address: 'Se 1220 401 Docklands Dr, Docklands, VIC, 3008',
      suburb: 'Docklands',
      postcode: '3008',
    })).toBe('401 Docklands Dr, Docklands VIC 3008')
    expect(packPlaceAddress({
      name: 'No suburb field',
      address: '401 Docklands Dr, Docklands, VIC, 3008',
      suburb: 'Area not confirmed',
    })).toBe('401 Docklands Dr, Docklands VIC 3008')
    expect(packPlaceAddress({ name: 'Plain', address: '12 Smith St', suburb: 'Harcourt', postcode: '3453' }))
      .toBe('12 Smith St, Harcourt 3453')
  })

  it('drops chained suite, level and unit prefixes seen in the live charity data', () => {
    const docklands = { suburb: 'Docklands', postcode: '3008' }
    expect(packPlaceAddress({ name: 'A', address: 'Suite 904, Level 9, 401 Docklands Dr, Docklands, VIC, 3008', ...docklands }))
      .toBe('401 Docklands Dr, Docklands VIC 3008')
    expect(packPlaceAddress({ name: 'B', address: 'L 1 U 108 198 Harbour Esp, Docklands, VIC, 3008', ...docklands }))
      .toBe('198 Harbour Esp, Docklands VIC 3008')
    expect(packPlaceAddress({ name: 'C', address: 'SE 223, 838 Collins Street, Docklands, VIC, 3008', ...docklands }))
      .toBe('838 Collins Street, Docklands VIC 3008')
    expect(packPlaceAddress({ name: 'D', address: 'U 1115 100 Harbour Esp, Docklands, VIC, 3008', ...docklands }))
      .toBe('100 Harbour Esp, Docklands VIC 3008')
  })

  it('does not strip words that only look like a unit prefix', () => {
    expect(packPlaceAddress({ name: 'Seaford', address: 'Seaford 3198' })).toBe('Seaford 3198')
    expect(packPlaceAddress({ name: 'Shop', address: 'Shop 5 Main Street', suburb: 'Bendigo', postcode: '3550' }))
      .toBe('Shop 5 Main Street, Bendigo 3550')
  })

  it('returns no detail line when there is no address or confirmed suburb', () => {
    expect(packPlaceAddress({ name: 'Unknown', suburb: 'Area not confirmed', postcode: '' })).toBeUndefined()
    expect(packPlaceAddress({ name: 'Unknown' })).toBeUndefined()
  })

  it('shortens long text at a word boundary', () => {
    const long = 'Community information and support centre for families and older residents in the northern suburbs'
    const clamped = clampPlaceText(long)
    expect(clamped.length).toBeLessThanOrEqual(80)
    expect(clamped.endsWith('…')).toBe(true)
    expect(clampPlaceText('Short name')).toBe('Short name')
  })
})
