import { storageKeys } from '../app/config/product'
import { preloadNearbyData } from '../data/preloadNearbyData'
import { getMyArea } from './myAreaStorage'

export interface SearchLocation {
  postcode: string
  label: string
}

interface StoredSearchLocation extends SearchLocation {
  selectedAt?: string
}

function readSearchLocation(): SearchLocation | null {
  try {
    const storedValue = window.localStorage.getItem(storageKeys.searchLocation)
    if (!storedValue) return null
    const parsed = JSON.parse(storedValue) as Partial<StoredSearchLocation>
    const postcode = typeof parsed.postcode === 'string' ? parsed.postcode.trim() : ''
    if (!/^\d{4}$/.test(postcode)) return null
    const myAreaPostcode = getMyArea()?.postcode
    // Search locations saved by older builds did not record whether the user
    // deliberately selected them. If one conflicts with My area, use My area
    // once; future explicit selections include selectedAt.
    if (!parsed.selectedAt && myAreaPostcode && postcode !== myAreaPostcode) return null
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
      selectedAt: new Date().toISOString(),
    }))
    void preloadNearbyData(postcode, { includeSupport: postcode !== getMyArea()?.postcode })
    return true
  } catch {
    return false
  }
}

export function getSearchPostcode(): string {
  return getSearchLocation()?.postcode || getMyArea()?.postcode || ''
}
