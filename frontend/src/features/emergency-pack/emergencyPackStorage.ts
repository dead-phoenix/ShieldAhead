import { storageKeys } from '../../app/config/product'
import type { CrisisKind } from '../crisis/crisisContent'
import { crisisPackOptions } from './emergencyPackContent'

export interface PackPlace {
  id: string
  name: string
  address?: string
  suburb?: string
  postcode?: string
  phone?: string
}

interface LegacyPackPlace extends PackPlace {
  detail?: string
}

export interface PackHelpline {
  id: string
  name: string
  phone: string
  detail?: string
}

export interface PackChecklistItem {
  id: string
  task: string
  description?: string
}

export interface PackChecklistGroup {
  id: string
  title: string
  items: PackChecklistItem[]
}

export interface EmergencyPackPreferences {
  includeHelplines: boolean
  includeWifi: boolean
  includeCharities: boolean
  crises: CrisisKind[]
}

export interface EmergencyPackSnapshot {
  areaLabel: string
  postcode: string
  savedAt?: string
  /** Set only when that list was loaded successfully, so an empty list can be told apart from missing data. */
  placesSavedAt: { wifi?: string; support?: string }
  wifi: PackPlace[]
  support: PackPlace[]
  helplines: PackHelpline[]
  checklists: Partial<Record<CrisisKind, PackChecklistGroup[]>>
}

interface LegacyEmergencyPackPreferences extends EmergencyPackPreferences {
  includeNearby: boolean
}

interface StoredEmergencyPack {
  preferences: EmergencyPackPreferences
  snapshot: EmergencyPackSnapshot
}

const crisisKinds = new Set(crisisPackOptions.map((option) => option.kind))

export const defaultEmergencyPackPreferences: EmergencyPackPreferences = {
  includeHelplines: true,
  includeWifi: true,
  includeCharities: true,
  crises: crisisPackOptions.map((option) => option.kind),
}

export function emptyEmergencyPackSnapshot(): EmergencyPackSnapshot {
  return {
    areaLabel: '',
    postcode: '',
    placesSavedAt: {},
    wifi: [],
    support: [],
    helplines: [],
    checklists: {},
  }
}

function isCrisisKind(value: unknown): value is CrisisKind {
  return typeof value === 'string' && crisisKinds.has(value as CrisisKind)
}

function readStored(): StoredEmergencyPack | null {
  try {
    const raw = window.localStorage.getItem(storageKeys.emergencyPack)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredEmergencyPack>
    return {
      preferences: normalizePreferences(parsed.preferences),
      snapshot: normalizeSnapshot(parsed.snapshot),
    }
  } catch {
    return null
  }
}

function normalizePreferences(value: Partial<LegacyEmergencyPackPreferences> | undefined): EmergencyPackPreferences {
  const crises = Array.isArray(value?.crises) ? value.crises.filter(isCrisisKind) : defaultEmergencyPackPreferences.crises
  return {
    includeHelplines: value?.includeHelplines ?? defaultEmergencyPackPreferences.includeHelplines,
    includeWifi: value?.includeWifi ?? value?.includeNearby ?? defaultEmergencyPackPreferences.includeWifi,
    includeCharities: value?.includeCharities ?? value?.includeNearby ?? defaultEmergencyPackPreferences.includeCharities,
    crises: crisisPackOptions.map((option) => option.kind).filter((kind) => crises.includes(kind)),
  }
}

function optionalTimestamp(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function normalizePlace(place: LegacyPackPlace): PackPlace {
  if (place.address || place.suburb || typeof place.detail !== 'string') {
    const { id, name, address, suburb, postcode, phone } = place
    return { id, name, address, suburb, postcode, phone }
  }
  const legacyAddress = place.detail.split(' · ')[0].trim()
  return {
    id: place.id,
    name: place.name,
    address: legacyAddress && legacyAddress !== 'Address not provided' ? legacyAddress : undefined,
    phone: place.phone,
  }
}

function normalizePlaces(value: unknown): PackPlace[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((place): place is LegacyPackPlace => typeof place?.id === 'string' && typeof place?.name === 'string')
    .map(normalizePlace)
}

function normalizeSnapshot(value: Partial<EmergencyPackSnapshot> | undefined): EmergencyPackSnapshot {
  const savedAt = optionalTimestamp(value?.savedAt)
  const wifi = normalizePlaces(value?.wifi)
  const support = normalizePlaces(value?.support)
  return {
    areaLabel: typeof value?.areaLabel === 'string' ? value.areaLabel : '',
    postcode: typeof value?.postcode === 'string' ? value.postcode : '',
    savedAt,
    placesSavedAt: {
      wifi: optionalTimestamp(value?.placesSavedAt?.wifi) ?? (wifi.length > 0 ? savedAt : undefined),
      support: optionalTimestamp(value?.placesSavedAt?.support) ?? (support.length > 0 ? savedAt : undefined),
    },
    wifi,
    support,
    helplines: Array.isArray(value?.helplines) ? value.helplines : [],
    checklists: value?.checklists && typeof value.checklists === 'object' ? value.checklists : {},
  }
}

export function readEmergencyPack(): StoredEmergencyPack {
  return readStored() ?? {
    preferences: defaultEmergencyPackPreferences,
    snapshot: emptyEmergencyPackSnapshot(),
  }
}

export function saveEmergencyPack(pack: StoredEmergencyPack) {
  window.localStorage.setItem(storageKeys.emergencyPack, JSON.stringify(pack))
}
