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
  location: '/location',
  map: '/map',
  nearby: '/nearby',
  wifi: '/wifi',
  wifiDetail: (id: string) => `/wifi/${id}`,
  support: '/support',
  supportDetail: (id: string) => `/support/${id}`,
  crisis: '/crisis',
  crisisDetail: (kind: string) => `/crisis/${kind}`,
  crisisGuidance: (kind: string) => `/crisis/${kind}/guidance`,
  emergencyPack: '/emergency-pack',
  settings: '/settings',
  editProfile: '/settings/edit-profile',
  consentSettings: '/settings/consent',
  offlineInformation: '/settings/offline-information',
  myArea: '/settings/my-area',
  deleteProfile: '/settings/delete-profile',
} as const

export const storageKeys = {
  onboardingDraft: 'shieldahead.onboarding-draft.v1',
  householdProfile: 'shieldahead.household-profile.v1',
  consent: 'shieldahead.consent.v1',
  offlinePreferences: 'shieldahead.offline-preferences.v1',
  usualWifiSpot: 'shieldahead.usual-wifi-spot.v1',
  searchLocation: 'shieldahead.search-location.v1',
  myArea: 'shieldahead.my-area.v1',
  crisisChecklist: 'shieldahead.crisis-checklist.v1',
  emergencyPack: 'shieldahead.emergency-pack.v1',
  siteUnlocked: 'shieldahead.site-unlocked.v1',
  nearbySnapshot: 'shieldahead.nearby-snapshot.v1',
  /** sessionStorage: set once the background nearby refresh has been tried in this session. */
  nearbyRefreshTried: 'shieldahead.nearby-refresh-tried.v1',
} as const
