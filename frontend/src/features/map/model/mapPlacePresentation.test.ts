import { describe, expect, it } from 'vitest'
import {
  enabledMapPlaceKinds,
  mapPlaceKindPresentation,
} from './mapPlacePresentation'

describe('map place presentation', () => {
  it('exposes every category backed by a live data source', () => {
    expect(enabledMapPlaceKinds).toEqual(['wifi', 'support', 'police', 'fire', 'hospital', 'ambulance'])
  })

  it('enables the emergency facility categories now that /api/facilities is integrated', () => {
    expect(mapPlaceKindPresentation.hospital.filterEnabled).toBe(true)
    expect(mapPlaceKindPresentation.police.filterEnabled).toBe(true)
    expect(mapPlaceKindPresentation.fire.filterEnabled).toBe(true)
    expect(mapPlaceKindPresentation.ambulance.filterEnabled).toBe(true)
  })
})
