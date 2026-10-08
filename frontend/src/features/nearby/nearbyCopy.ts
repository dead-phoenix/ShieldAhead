import type { OfflineServiceCategory, OfflineServiceRecord } from '../../data/offlineData'

/** Wording shared by the /nearby page and the crisis pack's nearby services page. */
export const NEARBY_CATEGORY_ORDER: readonly OfflineServiceCategory[] = [
  'hospital',
  'police',
  'fire',
  'ambulance',
  'wifi',
  'charity',
]

export const nearbyCategoryTitles: Record<OfflineServiceCategory, string> = {
  hospital: 'Hospitals',
  police: 'Police stations',
  fire: 'Fire stations',
  ambulance: 'Ambulance stations',
  wifi: 'Free Wi-Fi',
  charity: 'Charities',
}

export const nearbyCopy = {
  pageTitle: 'Saved nearby services',
  intro: 'Hospitals, police, fire and ambulance stations, free Wi-Fi and charities, saved on this device so this page works without an internet connection.',
  emergency: 'In an emergency call 000.',
  outOfRegion: (regionName: string) =>
    `Saved nearby services cover the ${regionName} region only. In an emergency call 000.`,
  staleArea: (snapshotArea: string, currentArea: string) =>
    `This list is for ${snapshotArea}, not ${currentArea}. Update saved information when you are online.`,
  savedListHeading: (area: string) => `Near ${area}`,
  staleListHeading: (area: string) => `Saved list for ${area}`,
  liveListHeading: 'Near your current location',
  savedOn: (date: string) => `Saved on ${date}. Distances are in a straight line, not by road. Check details before relying on them.`,
  noneInCategory: 'None saved nearby',
  approximateLocation: 'Approximate location',
  wifiNotConfirmed: 'Free Wi-Fi likely, not confirmed',
  noArea: 'Set My area while you are online to save nearby services on this device.',
  setArea: 'Set My area',
  saving: (area: string) => `Saving nearby services for ${area}…`,
  notSavedYet: 'Nearby services have not been saved on this device yet. They are saved automatically next time you are online.',
  sourcesTitle: 'Data sources',
  gps: {
    button: 'Use my current location',
    locating: 'Finding your location…',
    privacy: 'Your location is used on this device only. It is never sent anywhere.',
    denied: 'Location access is blocked. You can still use the saved list below.',
    timeout: 'Your location could not be found in time. Try again, or use the saved list below.',
    unavailable: 'Your location could not be found. Try again, or use the saved list below.',
    unsupported: 'This device cannot share its location. Use the saved list below.',
    noData: 'Nearby services are not saved on this device yet, so they cannot be listed for your location. Connect to the internet and try again.',
  },
} as const

export function formatDistanceKm(km: number): string {
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`
}

export function serviceDetail(record: Pick<OfflineServiceRecord, 'address' | 'suburb' | 'postcode'>): string | undefined {
  const place = [record.suburb, record.postcode].filter(Boolean).join(' ')
  return [record.address, place].filter(Boolean).join(', ') || undefined
}

export function isApproximateLocation(record: Pick<OfflineServiceRecord, 'category' | 'locationPrecision'>): boolean {
  return record.category === 'charity' || record.locationPrecision === 'postcode'
}

export function formatNearbyDate(value: string): string | undefined {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : new Intl.DateTimeFormat('en-AU', { dateStyle: 'long' }).format(date)
}
