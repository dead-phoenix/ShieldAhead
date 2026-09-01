import type { ConsentState, HouseholdProfile, OfflinePreferences } from './contracts'

/**
 * This IS the "backend" for the household profile, consent, and offline
 * preferences — deliberately client-side only, per PRODUCT.md: "No account
 * is required... Household details and consent remain on the device."
 * Nothing here ever leaves the phone. This is what lets the app open
 * fully offline once installed (US 1.3 AC1) — a server-side profile store
 * would work against that, not toward it.
 *
 * Uses localStorage, matching PRODUCT.md's stack note: "Local preferences
 * in localStorage; larger cached records are expected to use IndexedDB and
 * Cache Storage." Profile/consent/preferences are small — localStorage is
 * the right fit; the larger wifi/charity result caches are a separate,
 * IndexedDB-based concern (not this file).
 */

const PROFILE_KEY = 'shieldahead.householdProfile'
const CONSENT_KEY = 'shieldahead.consentState'
const OFFLINE_PREFS_KEY = 'shieldahead.offlinePreferences'

function safeRead<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    // Corrupt or unreadable storage should never crash the app — treat it
    // the same as "nothing saved yet", not as an error to surface.
    return null
  }
}

function safeWrite(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value))
}

//  Household profile — postcode is the only field the contract requires

export function getHouseholdProfile(): HouseholdProfile | null {
  const profile = safeRead<HouseholdProfile>(PROFILE_KEY)
  // Defensive re-check even though the type promises postcode is always
  // present — corrupt/partial JSON in storage could still violate that.
  if (!profile || typeof profile.postcode !== 'string' || !profile.postcode.trim()) {
    return null
  }
  return profile
}

export function saveHouseholdProfile(profile: HouseholdProfile): void {
  if (!profile.postcode || !profile.postcode.trim()) {
    throw new Error('A postcode is required to save the household profile.')
  }
  safeWrite(PROFILE_KEY, profile)
}

export function hasCompletedSetup(): boolean {
  return getHouseholdProfile() !== null
}

/** The one thing every other screen actually needs — see US 2.1/3.1. */
export function getHouseholdPostcode(): string | null {
  return getHouseholdProfile()?.postcode ?? null
}

//  Consent — per-category, matching ConsentState.optionalCategories

export function getConsentState(): ConsentState | null {
  return safeRead<ConsentState>(CONSENT_KEY)
}

export function setConsent(category: string, accepted: boolean): void {
  const current = getConsentState() ?? {
    profileStorageAccepted: false,
    optionalCategories: {},
    updatedAt: new Date().toISOString(),
  }
  const updated: ConsentState = {
    ...current,
    optionalCategories: { ...current.optionalCategories, [category]: accepted },
    updatedAt: new Date().toISOString(),
  }
  safeWrite(CONSENT_KEY, updated)
}

export function setProfileStorageAccepted(accepted: boolean): void {
  const current = getConsentState() ?? {
    profileStorageAccepted: false,
    optionalCategories: {},
    updatedAt: new Date().toISOString(),
  }
  safeWrite(CONSENT_KEY, {
    ...current,
    profileStorageAccepted: accepted,
    updatedAt: new Date().toISOString(),
  } satisfies ConsentState)
}

/** Declining a category must never block setup — US 1.2 AC2. This never throws. */
export function hasDeclinedConsent(): boolean {
  return getConsentState() !== null
}

//  Offline preferences — "saved for offline" flags, not the cached data itself

export function getOfflinePreferences(): OfflinePreferences | null {
  return safeRead<OfflinePreferences>(OFFLINE_PREFS_KEY)
}

export function setOfflineSaved(kind: 'wifi' | 'support', saved: boolean): void {
  const current: OfflinePreferences = getOfflinePreferences() ?? {
    wifiSaved: false,
    supportSaved: false,
  }
  const updated: OfflinePreferences = {
    ...current,
    wifiSaved: kind === 'wifi' ? saved : current.wifiSaved,
    supportSaved: kind === 'support' ? saved : current.supportSaved,
    lastUpdatedAt: new Date().toISOString(),
  }
  safeWrite(OFFLINE_PREFS_KEY, updated)
}

//  Delete everything — US 1.2 AC3, the "delete everything" requirement

/**
 * Clears every store this file owns in one action. Also clears the
 * "usual spot" pin key if one exists under the name Epic 2 is likely to
 * use — remove/adjust that line once the real pin-storage key is known,
 * so this genuinely deletes ALL household data, not just profile/consent.
 */
export function deleteAllData(): void {
  localStorage.removeItem(PROFILE_KEY)
  localStorage.removeItem(CONSENT_KEY)
  localStorage.removeItem(OFFLINE_PREFS_KEY)
  // TODO: also clear the Epic 2 "usual spot" pin and any IndexedDB-cached
  // wifi/charity result sets once those storage keys/stores are confirmed —
  // "delete everything" isn't complete until every store this app writes
  // to is covered here, not just the three this file directly owns.
}