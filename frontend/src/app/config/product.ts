export const productConfig = {
  name: 'ShieldAhead',
  status: 'Offline support app',
  description:
    'Prepare local Wi-Fi and support information before your connection is disrupted.',
  locale: 'en-AU',
  region: 'Loddon Campaspe, Victoria',
} as const

export const appRoutes = {
  home: '/',
  setup: '/setup',
  setupPrivacy: '/setup/privacy',
  householdBasics: '/setup/household',
  householdNeeds: '/setup/needs',
  setupReview: '/setup/review',
  consentChoices: '/setup/choices',
  setupComplete: '/setup/complete',
  wifi: '/wifi',
  wifiDetail: (id: string) => `/wifi/${id}`,
  support: '/support',
  supportDetail: (id: string) => `/support/${id}`,
  settings: '/settings',
  editProfile: '/settings/edit-profile',
  consentSettings: '/settings/consent',
  offlineInformation: '/settings/offline-information',
  deleteProfile: '/settings/delete-profile',
} as const

export const storageKeys = {
  onboardingDraft: 'shieldahead.onboarding-draft.v1',
  householdProfile: 'shieldahead.household-profile.v1',
  consent: 'shieldahead.consent.v1',
  offlinePreferences: 'shieldahead.offline-preferences.v1',
  usualWifiSpot: 'shieldahead.usual-wifi-spot.v1',
} as const
