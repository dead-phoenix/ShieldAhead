import { beforeEach, describe, expect, it } from 'vitest'
import { readMapSessionState, saveMapSessionState, type MapSessionState } from './mapSessionStorage'

const state: MapSessionState = {
  area: { postcode: '3453', label: 'Harcourt 3453' },
  query: 'Harcourt 3453',
  selectedKinds: ['wifi'],
  selectedPlaceId: 'wifi:1',
  panelMode: 'directions',
  mobileView: 'map',
  panelSize: 'full',
  listScrollTop: 120,
  viewport: { latitude: -36.75, longitude: 144.28, zoom: 13 },
  directions: {
    profile: 'foot-walking',
    origin: { latitude: -36.76, longitude: 144.27 },
    originLabel: 'Point selected on map',
  },
}

describe('Map session storage', () => {
  beforeEach(() => window.sessionStorage.clear())

  it('restores the current-tab Map flow including route inputs and viewport', () => {
    saveMapSessionState(state)
    expect(readMapSessionState()).toEqual(state)
  })

  it('ignores malformed saved state', () => {
    window.sessionStorage.setItem('shieldahead.map.session.v1', '{"area":{}}')
    expect(readMapSessionState()).toBeNull()
  })
})
