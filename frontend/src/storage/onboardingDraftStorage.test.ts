import { beforeEach, describe, expect, it, vi } from 'vitest'
import { storageKeys } from '../app/config/product'
import { saveMyArea } from './myAreaStorage'
import {
  getConsentState,
  getHouseholdProfile,
  getOnboardingDraft,
  saveConsentChoices,
  saveHouseholdProfile,
} from './onboardingDraftStorage'
import { getSearchPostcode, saveSearchLocation } from './searchLocationStorage'

vi.mock('../data/preloadNearbyData', () => ({
  preloadNearbyData: vi.fn(),
}))

function stored(key: string) {
  const raw = window.localStorage.getItem(key)
  return raw ? JSON.parse(raw) as Record<string, unknown> : null
}

describe('My area and the map search location', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('keeps an explicitly selected search area when My area changes', () => {
    saveMyArea({ postcode: '3000' })
    saveSearchLocation({ postcode: '3550', label: 'Bendigo 3550' })

    expect(saveMyArea({ postcode: '3168' })).not.toBeNull()
    expect(window.localStorage.getItem(storageKeys.searchLocation)).toContain('3550')
    expect(getSearchPostcode()).toBe('3550')
  })

  it('falls back to My area when no search has been made', () => {
    saveMyArea({ postcode: '3453' })
    expect(getSearchPostcode()).toBe('3453')
  })

  it('ignores a conflicting legacy search area and falls back to My area', () => {
    saveMyArea({ postcode: '3000' })
    window.localStorage.setItem(storageKeys.searchLocation, JSON.stringify({
      postcode: '3168',
      label: 'Clayton 3168',
    }))

    expect(getSearchPostcode()).toBe('3000')
  })
})

describe('household profile', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('saves only the kept fields', () => {
    expect(saveHouseholdProfile({
      childrenUnder15: 2,
      hasPets: true,
      accessibilityNeeds: ['Wheelchair'],
      healthNeeds: ['Insulin'],
      ...({ name: 'Mel', age: 40, postcode: '3000' } as object),
    })).toBe(true)

    expect(stored(storageKeys.householdProfile)).toEqual({
      childrenUnder15: 2,
      hasPets: true,
      accessibilityNeeds: ['Wheelchair'],
      healthNeeds: ['Insulin'],
    })
  })

  it('removes a category from the profile when consent is withdrawn', () => {
    saveHouseholdProfile({ childrenUnder15: 1, hasPets: false, healthNeeds: ['Insulin'] })
    expect(saveConsentChoices({ dependants: false, needs: true })).toBe(true)

    expect(getHouseholdProfile()).toEqual({ healthNeeds: ['Insulin'] })
    expect(getConsentState()?.optionalCategories).toEqual({ dependants: false, needs: true })
  })

  it('migrates an old draft that still holds name, age and postcode', () => {
    window.localStorage.setItem(storageKeys.onboardingDraft, JSON.stringify({
      currentStep: 'household-basics',
      profile: { name: 'Mel', age: 40, householdSize: 3, hasPets: true, postcode: '3453' },
      updatedAt: '2026-09-01T00:00:00.000Z',
    }))

    expect(getOnboardingDraft()).toEqual({
      currentStep: 'household-needs',
      profile: { hasPets: true },
      areaPostcode: '3453',
      updatedAt: '2026-09-01T00:00:00.000Z',
    })
  })
})
