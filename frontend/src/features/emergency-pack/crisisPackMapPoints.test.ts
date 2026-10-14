import { describe, expect, it } from 'vitest'
import {
  crisisPackMapLabel,
  crisisPackPlacesKey,
  isPostalAddress,
  isValidMapCoordinate,
  packPlaceMapPosition,
  type CrisisPackMapPoint,
} from './crisisPackMapPoints'

const harcourt = { latitude: -36.998, longitude: 144.263 }

describe('crisis pack map points', () => {
  it.each([
    'PO Box 220, Strathdale, VIC, 3550',
    'PO BOX 638, CASTLEMAINE, VIC, 3450',
    'P.O.Box 466, Castlemaine, VIC, 3450',
    'Po Box, Darling VIC 3145',
    'P O Box 12',
    'GPO Box 1, Melbourne VIC 3001',
    'Post Office Box 7',
    'Locked Bag 5, Bendigo VIC 3550',
    'Private Bag 2',
    'PMB 3, Kyneton',
    'Level 2, PO Box 9, Bendigo',
  ])('treats "%s" as a postal address', (address) => {
    expect(isPostalAddress(address)).toBe(true)
  })

  it.each([
    '12 Box Hill Rd, Box Hill VIC 3128',
    'Box Hill',
    '12 Boxwood Rd, Kangaroo Flat',
    '1 Post Office Place, Castlemaine',
    '40 Mount Alexander Rd',
    '',
    undefined,
  ])('treats "%s" as not postal', (address) => {
    expect(isPostalAddress(address)).toBe(false)
  })

  it('accepts only finite coordinates inside Australia', () => {
    expect(isValidMapCoordinate(-36.998, 144.263)).toBe(true)
    expect(isValidMapCoordinate(-42.88, 147.33)).toBe(true)
    expect(isValidMapCoordinate(0, 0)).toBe(false)
    expect(isValidMapCoordinate(Number.NaN, 144)).toBe(false)
    expect(isValidMapCoordinate(-36, Number.POSITIVE_INFINITY)).toBe(false)
    expect(isValidMapCoordinate(51.5, -0.12)).toBe(false)
    expect(isValidMapCoordinate('-36.9', '144.2')).toBe(false)
    expect(isValidMapCoordinate(undefined, undefined)).toBe(false)
  })

  it('plots Wi-Fi spots with coordinates, with or without an address', () => {
    expect(packPlaceMapPosition({ id: 'w', name: 'Library', ...harcourt }, 'wifi')).toEqual(harcourt)
    expect(packPlaceMapPosition({ id: 'w', name: 'Library', address: '1 High St', ...harcourt }, 'wifi')).toEqual(harcourt)
    expect(packPlaceMapPosition({ id: 'w', name: 'Library' }, 'wifi')).toBeNull()
  })

  it('plots charities only when they have a street address that is not a PO Box', () => {
    expect(packPlaceMapPosition({ id: 'c', name: 'Food bank', address: '15 Hargreaves St', ...harcourt }, 'charity')).toEqual(harcourt)
    expect(packPlaceMapPosition({ id: 'c', name: 'Food bank', address: 'PO Box 220, Strathdale', ...harcourt }, 'charity')).toBeNull()
    expect(packPlaceMapPosition({ id: 'c', name: 'Offline list charity', suburb: 'Harcourt', ...harcourt }, 'charity')).toBeNull()
    expect(packPlaceMapPosition({ id: 'c', name: 'Food bank', address: '15 Hargreaves St' }, 'charity')).toBeNull()
  })

  it('labels places by kind and list position', () => {
    expect(crisisPackMapLabel('wifi', 0)).toBe('W1')
    expect(crisisPackMapLabel('charity', 4)).toBe('C5')
  })

  it('builds a places key that changes with the places, their positions and the map style only', () => {
    const points: CrisisPackMapPoint[] = [
      { id: 'a', kind: 'wifi', label: 'W1', ...harcourt },
      { id: 'b', kind: 'charity', label: 'C1', latitude: -37.06, longitude: 144.21 },
    ]
    const key = crisisPackPlacesKey(points, 'style-a')
    expect(crisisPackPlacesKey([...points].reverse(), 'style-a')).toBe(key)
    expect(crisisPackPlacesKey(points.map((point) => ({ ...point, label: 'X9' })), 'style-a')).toBe(key)
    expect(crisisPackPlacesKey(points, 'style-b')).not.toBe(key)
    expect(crisisPackPlacesKey(points.slice(0, 1), 'style-a')).not.toBe(key)
    expect(crisisPackPlacesKey([{ ...points[0], latitude: -36.9981 }, points[1]], 'style-a')).not.toBe(key)
    expect(crisisPackPlacesKey([{ ...points[0], kind: 'charity' }, points[1]], 'style-a')).not.toBe(key)
  })
})
