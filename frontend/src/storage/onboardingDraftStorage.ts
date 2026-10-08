import { storageKeys } from '../app/config/product'
import { migrateLegacyLocalData, normalizeHouseholdProfile } from './legacyLocalDataMigration'

import type {
  ConsentState,
  HouseholdProfile,
  OfflinePreferences,
} from '../data/contracts'

export interface OnboardingDraft {
  currentStep: 'household-needs' | 'review' | 'choices'
  profile: Partial<HouseholdProfile>
  /** The My area postcode entered during setup; saved as My area when setup finishes. */
  areaPostcode?: string
  updatedAt: string
}

export function getOnboardingDraft(): OnboardingDraft | null {
  migrateLegacyLocalData()
  try {
    const storedValue = window.localStorage.getItem(storageKeys.onboardingDraft)
    return storedValue ? (JSON.parse(storedValue) as OnboardingDraft) : null
  } catch {
    return null
  }
}

export function saveOnboardingDraft(draft: OnboardingDraft): boolean {
  try {
    window.localStorage.setItem(
      storageKeys.onboardingDraft,
      JSON.stringify(draft),
    )
    return true
  } catch {
    return false
  }
}

export function clearOnboardingDraft(): void {
  window.localStorage.removeItem(storageKeys.onboardingDraft)
}

function readStoredValue<T>(key: string): T | null {
  try {
    const value = window.localStorage.getItem(key)
    return value ? (JSON.parse(value) as T) : null
  } catch {
    return null
  }
}

function writeStoredValue<T>(key: string, value: T): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function getHouseholdProfile(): HouseholdProfile | null {
  migrateLegacyLocalData()
  const stored = readStoredValue<unknown>(storageKeys.householdProfile)
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return null
  return normalizeHouseholdProfile(stored as Record<string, unknown>)
}

export function saveHouseholdProfile(profile: HouseholdProfile): boolean {
  return writeStoredValue(storageKeys.householdProfile, normalizeHouseholdProfile({ ...profile }))
}

export function getConsentState(): ConsentState | null {
  migrateLegacyLocalData()
  return readStoredValue<ConsentState>(storageKeys.consent)
}

export function hasCompletedSetup(): boolean {
  return Boolean(getHouseholdProfile() && getConsentState())
}

export function saveConsentState(consent: ConsentState): boolean {
  return writeStoredValue(storageKeys.consent, consent)
}

export function profileForChoices(
  profile: Partial<HouseholdProfile>,
  choices: Record<string, boolean | null | undefined>,
): HouseholdProfile {
  return {
    ...(choices.dependants === true
      ? {
          childrenUnder15: profile.childrenUnder15,
          hasPets: profile.hasPets,
        }
      : {}),
    ...(choices.needs === true
      ? {
          accessibilityNeeds: profile.accessibilityNeeds,
          healthNeeds: profile.healthNeeds,
        }
      : {}),
  }
}

export function saveConsentChoices(
  choices: Record<string, boolean>,
): boolean {
  const profile = getHouseholdProfile()
  if (!profile) return false

  const consentSaved = saveConsentState({
    profileStorageAccepted: true,
    optionalCategories: choices,
    updatedAt: new Date().toISOString(),
  })
  const profileSaved = saveHouseholdProfile(profileForChoices(profile, choices))
  return consentSaved && profileSaved
}

export function getOfflinePreferences(): OfflinePreferences {
  return (
    readStoredValue<OfflinePreferences>(storageKeys.offlinePreferences) ?? {
      wifiSaved: false,
      supportSaved: false,
    }
  )
}

export function saveOfflinePreferences(preferences: OfflinePreferences): boolean {
  return writeStoredValue(storageKeys.offlinePreferences, preferences)
}

export function getUsualWifiSpot(): string | null {
  return window.localStorage.getItem(storageKeys.usualWifiSpot)
}

export function saveUsualWifiSpot(id: string): void {
  window.localStorage.setItem(storageKeys.usualWifiSpot, id)
}

export function clearUsualWifiSpot(): void {
  window.localStorage.removeItem(storageKeys.usualWifiSpot)
}
