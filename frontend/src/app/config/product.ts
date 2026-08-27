export const productConfig = {
  name: 'ShieldAhead',
  status: 'working title',
  description:
    'Prepare local Wi-Fi and support information before your connection is disrupted.',
  locale: 'en-AU',
  region: 'Loddon Campaspe, Victoria',
} as const

export const appRoutes = {
  home: '/',
  setup: '/setup',
  householdBasics: '/setup/household',
  wifi: '/wifi',
  support: '/support',
  settings: '/settings',
} as const

export const storageKeys = {
  onboardingDraft: 'shieldahead.onboarding-draft.v1',
} as const
