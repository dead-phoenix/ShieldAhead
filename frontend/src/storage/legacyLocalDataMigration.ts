import { storageKeys } from '../app/config/product'
import type { HouseholdProfile, MyArea } from '../data/contracts'

const removedProfileFields = ['name', 'age', 'householdSize', 'postcode']

function readJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) as unknown : undefined
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringList(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : undefined
}

export function isValidPostcode(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}$/.test(value)
}

export function normalizeHouseholdProfile(value: Record<string, unknown>): HouseholdProfile {
  const accessibilityNeeds = stringList(value.accessibilityNeeds)
  const healthNeeds = stringList(value.healthNeeds)
  return {
    ...(typeof value.childrenUnder15 === 'number' && Number.isFinite(value.childrenUnder15) ? { childrenUnder15: value.childrenUnder15 } : {}),
    ...(typeof value.hasPets === 'boolean' ? { hasPets: value.hasPets } : {}),
    ...(accessibilityNeeds ? { accessibilityNeeds } : {}),
    ...(healthNeeds ? { healthNeeds } : {}),
  }
}

function hasRemovedFields(value: Record<string, unknown>): boolean {
  return removedProfileFields.some((field) => field in value)
}

function migrateProfile() {
  const stored = readJson(storageKeys.householdProfile)
  if (!isRecord(stored) || !hasRemovedFields(stored)) return
  const postcode = typeof stored.postcode === 'string' ? stored.postcode.trim() : ''
  if (isValidPostcode(postcode) && window.localStorage.getItem(storageKeys.myArea) === null) {
    const area: MyArea = { postcode, label: postcode, savedAt: new Date().toISOString() }
    window.localStorage.setItem(storageKeys.myArea, JSON.stringify(area))
  }
  window.localStorage.setItem(storageKeys.householdProfile, JSON.stringify(normalizeHouseholdProfile(stored)))
}

function migrateDraft() {
  const stored = readJson(storageKeys.onboardingDraft)
  if (!isRecord(stored) || !isRecord(stored.profile)) return
  const needsStepRename = stored.currentStep === 'household-basics'
  if (!hasRemovedFields(stored.profile) && !needsStepRename) return
  const legacyPostcode = typeof stored.profile.postcode === 'string' ? stored.profile.postcode.trim() : ''
  const areaPostcode = typeof stored.areaPostcode === 'string' ? stored.areaPostcode : legacyPostcode
  window.localStorage.setItem(storageKeys.onboardingDraft, JSON.stringify({
    ...stored,
    currentStep: needsStepRename ? 'household-needs' : stored.currentStep,
    profile: normalizeHouseholdProfile(stored.profile),
    ...(areaPostcode ? { areaPostcode } : {}),
  }))
}

function migrateConsent() {
  const stored = readJson(storageKeys.consent)
  if (!isRecord(stored) || !isRecord(stored.optionalCategories) || !('basics' in stored.optionalCategories)) return
  const optionalCategories = { ...stored.optionalCategories }
  delete optionalCategories.basics
  window.localStorage.setItem(storageKeys.consent, JSON.stringify({ ...stored, optionalCategories }))
}

/**
 * Rewrites data saved by older builds: drops profile fields that are no longer
 * kept and moves the old profile postcode into My area. Safe to call repeatedly;
 * if storage is full or blocked, the old data is left as it was and the next
 * call tries again.
 */
export function migrateLegacyLocalData(): void {
  for (const step of [migrateProfile, migrateDraft, migrateConsent]) {
    try {
      step()
    } catch {
      // Leave this record untouched; the remaining steps are independent.
    }
  }
}
