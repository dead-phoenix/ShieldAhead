import { storageKeys } from '../app/config/product'
import type { HouseholdProfile } from '../data/contracts'

export interface OnboardingDraft {
  currentStep: 'household-basics'
  profile: Pick<HouseholdProfile, 'name' | 'householdSize' | 'postcode'>
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
