import { storageKeys } from '../app/config/product'
import type { MyArea } from '../data/contracts'
import { preloadNearbyData } from '../data/preloadNearbyData'
import { isValidPostcode, migrateLegacyLocalData } from './legacyLocalDataMigration'

export interface MyAreaInput {
  postcode: string
  label?: string
  localityId?: string
  localityName?: string
}

export const MY_AREA_CHANGED_EVENT = 'shieldahead:my-area-changed'

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/** "Harcourt 3453" when the suburb is known, otherwise just the postcode. */
export function formatAreaLabel(postcode: string, localityName?: string): string {
  const name = optionalString(localityName)
  return name ? `${name} ${postcode}` : postcode
}

function readMyArea(): MyArea | null {
  try {
    const raw = window.localStorage.getItem(storageKeys.myArea)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<MyArea>
    const postcode = typeof parsed.postcode === 'string' ? parsed.postcode.trim() : ''
    if (!isValidPostcode(postcode)) return null
    const localityId = optionalString(parsed.localityId)
    const localityName = optionalString(parsed.localityName)
    return {
      postcode,
      ...(localityId ? { localityId } : {}),
      ...(localityName ? { localityName } : {}),
      label: optionalString(parsed.label) ?? formatAreaLabel(postcode, localityName),
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : '',
    }
  } catch {
    return null
  }
}

export function getMyArea(): MyArea | null {
  migrateLegacyLocalData()
  return readMyArea()
}

/** Returns the saved area, or null when the postcode is invalid or storage is unavailable. */
export function saveMyArea(input: MyAreaInput): MyArea | null {
  const postcode = input.postcode.trim()
  if (!isValidPostcode(postcode)) return null
  const previous = readMyArea()
  const localityId = optionalString(input.localityId)
  const localityName = optionalString(input.localityName)
  const area: MyArea = {
    postcode,
    ...(localityId ? { localityId } : {}),
    ...(localityName ? { localityName } : {}),
    label: optionalString(input.label) ?? formatAreaLabel(postcode, localityName),
    savedAt: new Date().toISOString(),
  }
  try {
    window.localStorage.setItem(storageKeys.myArea, JSON.stringify(area))
  } catch {
    return null
  }
  if (postcode !== previous?.postcode) void preloadNearbyData(postcode, { includeSupport: false })
  if (postcode !== previous?.postcode || localityId !== previous?.localityId) {
    window.dispatchEvent(new Event(MY_AREA_CHANGED_EVENT))
  }
  return area
}
