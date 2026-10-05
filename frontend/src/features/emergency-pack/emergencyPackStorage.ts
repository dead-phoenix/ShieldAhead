import { storageKeys } from '../../app/config/product'
import type { CrisisKind } from '../crisis/crisisContent'
import { crisisPackOptions } from './emergencyPackContent'

export interface PackPlace {
  id: string
  name: string
  detail: string
  phone?: string
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

function normalizeSnapshot(value: Partial<EmergencyPackSnapshot> | undefined): EmergencyPackSnapshot {
  const savedAt = optionalTimestamp(value?.savedAt)
  const wifi = Array.isArray(value?.wifi) ? value.wifi : []
  const support = Array.isArray(value?.support) ? value.support : []
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
