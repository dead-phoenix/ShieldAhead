import { storageKeys } from '../app/config/product'
import type { AvailabilityStatus, SupportService, WifiLocation } from '../data/contracts'

export const SAVED_PLACES_VERSION = 1
export const SAVED_PLACES_LIMIT = 50
export const SAVED_PLACES_CHANGED_EVENT = 'shieldahead:saved-places-changed'

export type SavedPlaceKind = 'wifi' | 'support' | 'facility'
export type SavedPlaceType = 'wifi' | 'support' | 'police' | 'fire' | 'hospital' | 'ambulance'

export interface SavedAccessPoint {
  name: string
  latitude?: number
  longitude?: number
}

/** Everything the saved-place view renders. Never holds anything relative to the
 * user (distance, route origin, live position or search text). */
export interface SavedPlaceRecord {
  id: string
  placeType: SavedPlaceType
  name: string
  address?: string
  suburb?: string
  postcode?: string
  latitude?: number
  longitude?: number
  phone?: string
  website?: string
  openingHours?: string
  accessConditions?: string[]
  serviceTypes?: string[]
  eligibility?: string
  verificationStatus?: WifiLocation['verificationStatus']
  partnerStatus?: SupportService['partnerStatus']
  availabilityStatus?: AvailabilityStatus
  availabilityUpdatedAt?: string
  availabilityFreshness?: SupportService['availabilityFreshness']
  accessPoints?: SavedAccessPoint[]
  dataUpdatedAt: string
}

export interface SavedPlace {
  key: string
  kind: SavedPlaceKind
  savedAt: string
  record: SavedPlaceRecord
}

export type SavedPlaceInput = Omit<SavedPlace, 'savedAt'>
export type SavePlaceResult = 'saved' | 'full' | 'failed'

const KINDS: readonly SavedPlaceKind[] = ['wifi', 'support', 'facility']
const PLACE_TYPES: readonly SavedPlaceType[] = ['wifi', 'support', 'police', 'fire', 'hospital', 'ambulance']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function optionalStrings(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const strings = value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
  return strings.length > 0 ? strings : undefined
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return allowed.includes(value as T) ? value as T : undefined
}

function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T
}

/** Copies only the known place fields, so nothing user-relative can be stored by accident. */
export function sanitizeSavedPlaceRecord(value: unknown): SavedPlaceRecord | null {
  if (!isRecord(value)) return null
  const id = optionalString(value.id)
  const name = optionalString(value.name)
  const placeType = pickEnum(value.placeType, PLACE_TYPES)
  const dataUpdatedAt = typeof value.dataUpdatedAt === 'string' ? value.dataUpdatedAt : undefined
  if (!id || !name || !placeType || dataUpdatedAt === undefined) return null
  const accessPoints = Array.isArray(value.accessPoints)
    ? value.accessPoints
      .filter(isRecord)
      .map((point) => withoutUndefined({
        name: optionalString(point.name) ?? '',
        latitude: optionalNumber(point.latitude),
        longitude: optionalNumber(point.longitude),
      }))
      .filter((point) => point.name)
    : []
  return withoutUndefined({
    id,
    placeType,
    name,
    address: optionalString(value.address),
    suburb: optionalString(value.suburb),
    postcode: optionalString(value.postcode),
    latitude: optionalNumber(value.latitude),
    longitude: optionalNumber(value.longitude),
    phone: optionalString(value.phone),
    website: optionalString(value.website),
    openingHours: optionalString(value.openingHours),
    accessConditions: optionalStrings(value.accessConditions),
    serviceTypes: optionalStrings(value.serviceTypes),
    eligibility: optionalString(value.eligibility),
    verificationStatus: pickEnum(value.verificationStatus, ['confirmed', 'likely'] as const),
    partnerStatus: pickEnum(value.partnerStatus, ['partner', 'open-referral', 'unknown'] as const),
    availabilityStatus: pickEnum(value.availabilityStatus, ['not-confirmed', 'normal', 'low', 'closed'] as const),
    availabilityUpdatedAt: optionalString(value.availabilityUpdatedAt),
    availabilityFreshness: pickEnum(value.availabilityFreshness, ['current', 'stale'] as const),
    accessPoints: accessPoints.length > 0 ? accessPoints : undefined,
    dataUpdatedAt,
  })
}

function sanitizeSavedPlace(value: unknown): SavedPlace | null {
  if (!isRecord(value)) return null
  const key = optionalString(value.key)
  const kind = pickEnum(value.kind, KINDS)
  const savedAt = optionalString(value.savedAt)
  const record = sanitizeSavedPlaceRecord(value.record)
  if (!key || !kind || !savedAt || !record) return null
  return { key, kind, savedAt, record }
}

function parse(raw: string | null): SavedPlace[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || parsed.version !== SAVED_PLACES_VERSION || !Array.isArray(parsed.places)) return []
    const seen = new Set<string>()
    return parsed.places
      .map(sanitizeSavedPlace)
      .filter((place): place is SavedPlace => {
        if (!place || seen.has(place.key)) return false
        seen.add(place.key)
        return true
      })
  } catch {
    return []
  }
}

let cachedRaw: string | null | undefined
let cachedPlaces: SavedPlace[] = []

/** Newest first. Returns the same array until storage changes, for useSyncExternalStore. */
export function readSavedPlaces(): SavedPlace[] {
  let raw: string | null
  try {
    raw = window.localStorage.getItem(storageKeys.savedPlaces)
  } catch {
    raw = null
  }
  if (raw === cachedRaw) return cachedPlaces
  cachedRaw = raw
  cachedPlaces = parse(raw).sort((left, right) => Date.parse(right.savedAt) - Date.parse(left.savedAt))
  return cachedPlaces
}

export function getSavedPlace(key: string): SavedPlace | undefined {
  return readSavedPlaces().find((place) => place.key === key)
}

function writeSavedPlaces(places: SavedPlace[]): boolean {
  try {
    window.localStorage.setItem(storageKeys.savedPlaces, JSON.stringify({ version: SAVED_PLACES_VERSION, places }))
  } catch {
    return false
  }
  window.dispatchEvent(new Event(SAVED_PLACES_CHANGED_EVENT))
  return true
}

export function savePlace(input: SavedPlaceInput): SavePlaceResult {
  const record = sanitizeSavedPlaceRecord(input.record)
  if (!record) return 'failed'
  const existing = readSavedPlaces().filter((place) => place.key !== input.key)
  if (existing.length >= SAVED_PLACES_LIMIT) return 'full'
  const next: SavedPlace = { key: input.key, kind: input.kind, savedAt: new Date().toISOString(), record }
  return writeSavedPlaces([next, ...existing]) ? 'saved' : 'failed'
}

export function removeSavedPlace(key: string): boolean {
  const existing = readSavedPlaces()
  if (!existing.some((place) => place.key === key)) return true
  return writeSavedPlaces(existing.filter((place) => place.key !== key))
}

export function subscribeToSavedPlaces(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === storageKeys.savedPlaces) onChange()
  }
  window.addEventListener(SAVED_PLACES_CHANGED_EVENT, onChange)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(SAVED_PLACES_CHANGED_EVENT, onChange)
    window.removeEventListener('storage', onStorage)
  }
}
