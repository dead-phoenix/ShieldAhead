import { storageKeys } from '../app/config/product'
import { preloadNearbyData } from '../data/preloadNearbyData'
import { getHouseholdProfile } from './onboardingDraftStorage'

export interface SearchLocation {
  postcode: string
  label: string
}

function readSearchLocation(): SearchLocation | null {
  try {
    const storedValue = window.localStorage.getItem(storageKeys.searchLocation)
    if (!storedValue) return null
    const parsed = JSON.parse(storedValue) as Partial<SearchLocation>
    const postcode = typeof parsed.postcode === 'string' ? parsed.postcode.trim() : ''
    if (!/^\d{4}$/.test(postcode)) return null
    return {
      postcode,
      label: typeof parsed.label === 'string' && parsed.label.trim()
        ? parsed.label.trim()
        : postcode,
    }
  } catch {
    return null
  }
}

export function getSearchLocation(): SearchLocation | null {
  return readSearchLocation()
}

export function saveSearchLocation(location: SearchLocation): boolean {
  const postcode = location.postcode.trim()
  if (!/^\d{4}$/.test(postcode)) return false
  try {
    window.localStorage.setItem(storageKeys.searchLocation, JSON.stringify({
      postcode,
      label: location.label.trim() || postcode,
    }))
    void preloadNearbyData(postcode)
    return true
  } catch {
    return false
  }
}

export function getSearchPostcode(): string {
  return getSearchLocation()?.postcode || getHouseholdProfile()?.postcode || ''
}
