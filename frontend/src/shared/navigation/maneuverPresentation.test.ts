import { describe, expect, it } from 'vitest'
import type { NavigationStep } from '../../data/api/directionsApi'
import { announcementText, distancePhrase, maneuverPhrase } from './maneuverPresentation'

function step(overrides: Partial<NavigationStep> = {}): NavigationStep {
  return {
    distanceMeters: 100,
    durationSeconds: 60,
    maneuverType: 1,
    instruction: 'Turn right onto Bourke Street Mall',
    streetName: 'Bourke Street Mall',
    startCoordinateIndex: 0,
    ...overrides,
  }
}

describe('maneuverPhrase', () => {
  it('names the street when one is published', () => {
    expect(maneuverPhrase(step())).toBe('Turn right onto Bourke Street Mall')
  })

  it('falls back to just the maneuver when no street name is published', () => {
    expect(maneuverPhrase(step({ streetName: undefined }))).toBe('Turn right')
  })

  it('falls back to a generic "Continue" for an unrecognised maneuver code', () => {
    expect(maneuverPhrase(step({ maneuverType: 999, streetName: undefined }))).toBe('Continue')
  })

  it.each([
    [0, 'Turn left'],
    [2, 'Take a sharp left'],
    [6, 'Continue straight'],
    [9, 'Make a U-turn'],
    [10, 'Arrive at your destination'],
  ])('maps maneuver type %i to %s', (maneuverType, expected) => {
    expect(maneuverPhrase(step({ maneuverType, streetName: undefined }))).toBe(expected)
  })
})

describe('distancePhrase', () => {
  it('says "now" once within the imminent range', () => {
    expect(distancePhrase(10)).toBe('now')
  })

  it('rounds metre distances to the nearest 10', () => {
    expect(distancePhrase(147)).toBe('in 150 meters')
  })

  it('switches to kilometers past 1000 meters', () => {
    expect(distancePhrase(1500)).toBe('in 1.5 kilometers')
  })
})

describe('announcementText', () => {
  it('omits distance when none is given', () => {
    expect(announcementText(step())).toBe('Turn right onto Bourke Street Mall')
  })

  it('appends the distance phrase when given', () => {
    expect(announcementText(step(), 150)).toBe('Turn right onto Bourke Street Mall in 150 meters')
  })
})
