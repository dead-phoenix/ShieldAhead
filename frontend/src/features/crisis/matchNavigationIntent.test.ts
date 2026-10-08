import { describe, expect, it } from 'vitest'
import { matchNavigationIntent, offlineNavigationTarget } from './matchNavigationIntent'

describe('offlineNavigationTarget', () => {
  it('sends the plain Map destination to /nearby only when offline', () => {
    expect(offlineNavigationTarget('/map', false)).toBe('/nearby')
    expect(offlineNavigationTarget('/map', true)).toBe('/map')
  })

  it.each(['wifi', 'hospital', 'police', 'fire', 'ambulance', 'support'])(
    'sends a %s category search to /nearby (keeping the category) when offline, since the Map itself is unusable offline',
    (category) => {
      expect(offlineNavigationTarget(`/map?category=${category}`, false)).toBe(`/nearby?category=${category}`)
      expect(offlineNavigationTarget(`/map?category=${category}`, true)).toBe(`/map?category=${category}`)
    },
  )

  it('leaves non-Map destinations alone regardless of connectivity', () => {
    expect(offlineNavigationTarget('/emergency-pack', false)).toBe('/emergency-pack')
    expect(offlineNavigationTarget('/crisis', false)).toBe('/crisis')
  })
})

describe('matchNavigationIntent', () => {
  it.each([
    ['take me to wifi', '/map?category=wifi'],
    ['free wi-fi', '/map?category=wifi'],
    ['where is wifi nearby', '/map?category=wifi'],
    ['wiffi', '/map?category=wifi'],
    ['nearest hospital', '/map?category=hospital'],
    ['hosptal', '/map?category=hospital'],
    ['police station', '/map?category=police'],
    ['fire station', '/map?category=fire'],
    ['ambulance', '/map?category=ambulance'],
    ['charities near me', '/map?category=support'],
    ['food bank', '/map?category=support'],
    ['emergency pack', '/emergency-pack'],
    ['show me the map', '/map'],
  ])('routes "%s" to %s', (query, expected) => {
    expect(matchNavigationIntent(query)).toBe(expected)
  })

  it('returns undefined for hazard questions with no destination word', () => {
    expect(matchNavigationIntent('How should I prepare for bushfire')).toBeUndefined()
    expect(matchNavigationIntent('The power just went out')).toBeUndefined()
  })

  it('returns undefined for empty or unrelated input', () => {
    expect(matchNavigationIntent('')).toBeUndefined()
    expect(matchNavigationIntent('   ')).toBeUndefined()
    expect(matchNavigationIntent('what is the weather')).toBeUndefined()
  })
})
