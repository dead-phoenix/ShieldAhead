import { storageKeys } from '../app/config/product'
import type {
  ConsentState,
  HouseholdProfile,
  OfflinePreferences,
} from '../data/contracts'

export interface OnboardingDraft {
  currentStep: 'household-basics' | 'household-needs' | 'review' | 'choices'
  profile: Partial<HouseholdProfile>
  updatedAt: string
}

export function getOnboardingDraft(): OnboardingDraft | null {
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
  return readStoredValue<HouseholdProfile>(storageKeys.householdProfile)
}

export function saveHouseholdProfile(profile: HouseholdProfile): boolean {
  return writeStoredValue(storageKeys.householdProfile, profile)
}

export function getConsentState(): ConsentState | null {
  return readStoredValue<ConsentState>(storageKeys.consent)
}

export function saveConsentState(consent: ConsentState): boolean {
  return writeStoredValue(storageKeys.consent, consent)
}

export function saveConsentChoices(
  choices: Record<string, boolean>,
): boolean {
  const profile = getHouseholdProfile()
  if (!profile) return false

  const filteredProfile: HouseholdProfile = {
    postcode: profile.postcode,
    ...(choices.basics
      ? {
          name: profile.name,
          age: profile.age,
          householdSize: profile.householdSize,
        }
      : {}),
    ...(choices.dependants
      ? {
          childrenUnder15: profile.childrenUnder15,
          hasPets: profile.hasPets,
        }
      : {}),
    ...(choices.needs
      ? {
          accessibilityNeeds: profile.accessibilityNeeds,
          healthNeeds: profile.healthNeeds,
        }
      : {}),
  }

  const consentSaved = saveConsentState({
    profileStorageAccepted: true,
    optionalCategories: choices,
    updatedAt: new Date().toISOString(),
  })
  const profileSaved = saveHouseholdProfile(filteredProfile)
  return consentSaved && profileSaved
}

export function getOfflinePreferences(): OfflinePreferences {
  return (
    readStoredValue<OfflinePreferences>(storageKeys.offlinePreferences) ?? {
      wifiSaved: true,
      supportSaved: true,
      lastUpdatedAt: '2026-08-27T09:42:00.000Z',
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

export function clearProfileAndChoices(removeOfflineInformation: boolean): void {
  window.localStorage.removeItem(storageKeys.householdProfile)
  window.localStorage.removeItem(storageKeys.consent)
  window.localStorage.removeItem(storageKeys.onboardingDraft)
  window.localStorage.removeItem(storageKeys.usualWifiSpot)
  if (removeOfflineInformation) {
    writeStoredValue(storageKeys.offlinePreferences, {
      wifiSaved: false,
      supportSaved: false,
    })
  }
}
