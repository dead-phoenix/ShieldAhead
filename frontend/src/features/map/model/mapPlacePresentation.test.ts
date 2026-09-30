import { describe, expect, it } from 'vitest'
import {
  enabledMapPlaceKinds,
  mapPlaceKindPresentation,
} from './mapPlacePresentation'

describe('map place presentation', () => {
  it('exposes only categories backed by the current production data sources', () => {
    expect(enabledMapPlaceKinds).toEqual(['wifi', 'support'])
  })

  it('keeps planned emergency categories hidden until their API is integrated', () => {
    expect(mapPlaceKindPresentation.hospital.filterEnabled).toBe(false)
    expect(mapPlaceKindPresentation.police.filterEnabled).toBe(false)
    expect(mapPlaceKindPresentation.fire.filterEnabled).toBe(false)
    expect(mapPlaceKindPresentation.ambulance.filterEnabled).toBe(false)
  })
})

