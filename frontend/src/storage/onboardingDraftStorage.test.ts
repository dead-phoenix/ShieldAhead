import { beforeEach, describe, expect, it, vi } from 'vitest'
import { storageKeys } from '../app/config/product'
import { saveHouseholdProfile } from './onboardingDraftStorage'
import { getSearchPostcode, saveSearchLocation } from './searchLocationStorage'

vi.mock('../data/preloadNearbyData', () => ({
  preloadNearbyData: vi.fn(),
}))

describe('household profile location synchronisation', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('clears an older search override when the household postcode changes', () => {
    window.localStorage.setItem(storageKeys.householdProfile, JSON.stringify({ postcode: '3168' }))
    window.localStorage.setItem(storageKeys.searchLocation, JSON.stringify({
      postcode: '3168',
      label: 'Clayton 3168',
    }))

    expect(saveHouseholdProfile({ postcode: '3000' })).toBe(true)
    expect(window.localStorage.getItem(storageKeys.searchLocation)).toBeNull()
  })

  it('keeps an explicitly selected search area when the profile postcode is unchanged', () => {
    window.localStorage.setItem(storageKeys.householdProfile, JSON.stringify({ postcode: '3000' }))
    saveSearchLocation({ postcode: '3550', label: 'Bendigo 3550' })

    expect(saveHouseholdProfile({ postcode: '3000', name: 'Mel' })).toBe(true)
    expect(window.localStorage.getItem(storageKeys.searchLocation)).toContain('3550')
  })

  it('ignores a conflicting legacy search area and falls back to the profile postcode', () => {
    window.localStorage.setItem(storageKeys.householdProfile, JSON.stringify({ postcode: '3000' }))
    window.localStorage.setItem(storageKeys.searchLocation, JSON.stringify({
      postcode: '3168',
      label: 'Clayton 3168',
    }))

    expect(getSearchPostcode()).toBe('3000')
  })
})
