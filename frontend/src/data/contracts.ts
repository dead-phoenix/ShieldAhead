export interface HouseholdProfile {
  name?: string
  age?: number
  householdSize?: number
  childrenUnder15?: number
  hasPets?: boolean
  accessibilityNeeds?: string[]
  healthNeeds?: string[]
  postcode: string
}

export interface ConsentState {
  profileStorageAccepted: boolean
  optionalCategories: Record<string, boolean>
  updatedAt: string
}

export interface WifiLocation {
  id: string
  name: string
  address: string
  suburb: string
  postcode: string
  latitude?: number
  longitude?: number
  distanceKm?: number
  openingHours?: string
  accessConditions?: string[]
  dataUpdatedAt: string
}

export type AvailabilityStatus = 'not-confirmed' | 'normal' | 'low' | 'closed'

export interface SupportService {
  id: string
  name: string
  serviceTypes: string[]
  address: string
  suburb: string
  postcode: string
  latitude?: number
  longitude?: number
  distanceKm?: number
  phone?: string
  website?: string
  eligibility?: string
  partnerStatus?: 'partner' | 'open-referral' | 'unknown'
  availabilityStatus: AvailabilityStatus
  availabilityUpdatedAt?: string
  dataUpdatedAt: string
}

export interface OfflinePreferences {
  wifiSaved: boolean
  supportSaved: boolean
  lastUpdatedAt?: string
}

export interface DatasetMetadata {
  version: string
  generatedAt: string
  sourceName: string
  coverageAreas: string[]
  limitations: string[]
}

export interface DatasetResult<T> {
  records: T[]
  metadata: DatasetMetadata
}
