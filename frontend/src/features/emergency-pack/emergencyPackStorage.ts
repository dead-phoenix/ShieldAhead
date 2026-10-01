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
  includeNearby: boolean
  includeHelplines: boolean
  crises: CrisisKind[]
}

export interface EmergencyPackSnapshot {
  areaLabel: string
  postcode: string
  savedAt?: string
  wifi: PackPlace[]
  support: PackPlace[]
  helplines: PackHelpline[]
  checklists: Partial<Record<CrisisKind, PackChecklistGroup[]>>
}

interface StoredEmergencyPack {
  preferences: EmergencyPackPreferences
  snapshot: EmergencyPackSnapshot
}

const crisisKinds = new Set(crisisPackOptions.map((option) => option.kind))

export const defaultEmergencyPackPreferences: EmergencyPackPreferences = {
  includeNearby: true,
  includeHelplines: true,
  crises: crisisPackOptions.map((option) => option.kind),
}

export function emptyEmergencyPackSnapshot(): EmergencyPackSnapshot {
  return {
    areaLabel: '',
    postcode: '',
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

function normalizePreferences(value: Partial<EmergencyPackPreferences> | undefined): EmergencyPackPreferences {
  const crises = Array.isArray(value?.crises) ? value.crises.filter(isCrisisKind) : defaultEmergencyPackPreferences.crises
  return {
    includeNearby: value?.includeNearby ?? defaultEmergencyPackPreferences.includeNearby,
    includeHelplines: value?.includeHelplines ?? defaultEmergencyPackPreferences.includeHelplines,
    crises: crisisPackOptions.map((option) => option.kind).filter((kind) => crises.includes(kind)),
  }
}

function normalizeSnapshot(value: Partial<EmergencyPackSnapshot> | undefined): EmergencyPackSnapshot {
  return {
    areaLabel: typeof value?.areaLabel === 'string' ? value.areaLabel : '',
    postcode: typeof value?.postcode === 'string' ? value.postcode : '',
    savedAt: typeof value?.savedAt === 'string' ? value.savedAt : undefined,
    wifi: Array.isArray(value?.wifi) ? value.wifi : [],
    support: Array.isArray(value?.support) ? value.support : [],
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
