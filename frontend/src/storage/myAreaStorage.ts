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

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
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
      label: optionalString(parsed.label) ?? postcode,
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
  const previousPostcode = readMyArea()?.postcode
  const localityId = optionalString(input.localityId)
  const localityName = optionalString(input.localityName)
  const area: MyArea = {
    postcode,
    ...(localityId ? { localityId } : {}),
    ...(localityName ? { localityName } : {}),
    label: optionalString(input.label) ?? postcode,
    savedAt: new Date().toISOString(),
  }
  try {
    window.localStorage.setItem(storageKeys.myArea, JSON.stringify(area))
  } catch {
    return null
  }
  if (postcode !== previousPostcode) void preloadNearbyData(postcode)
  return area
}
