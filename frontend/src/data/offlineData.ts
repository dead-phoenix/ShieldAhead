// Shapes of the generated files in public/data/ (scripts/build_offline_data.py, schemaVersion 1).

export type OfflineServiceCategory = 'wifi' | 'charity' | 'police' | 'fire' | 'hospital' | 'ambulance'

/** 'feature' = the source's own point for the facility; 'street' = matched to a Vicmap Address
 * point; 'postcode' = ABS postal area centroid, so the UI should say "approximate location". */
export type LocationPrecision = 'street' | 'postcode' | 'feature'

export type OfflineVerification = 'confirmed' | 'likely' | 'not-confirmed'

export type OfflineSourceId =
  | 'vicfreewifi'
  | 'vicmap-foi'
  | 'vicmap-address'
  | 'vicmap-admin'
  | 'acnc'
  | 'abs-poa-2021'
  | 'abs-lga-2025'

export interface OfflineServiceRecord {
  id: string
  category: OfflineServiceCategory
  name: string
  /** Always null for charities: street addresses are deliberately not stored. */
  address: string | null
  suburb: string | null
  postcode: string | null
  /** Charity coordinates are rounded to 3 decimal places (about 100 m). */
  lat: number
  lng: number
  locationPrecision: LocationPrecision
  phone: string | null
  website: string | null
  serviceTypes: string[]
  verification: OfflineVerification | null
  sourceId: OfflineSourceId
}

export interface PostcodeRecord {
  id: string
  postcode: string
  lat: number
  lng: number
}

export interface LocalityRecord {
  id: string
  name: string
  /** Most addresses first. */
  postcodes: string[]
  lat: number
  lng: number
}

export interface OfflineSource {
  id: OfflineSourceId
  name: string
  url: string
  retrievedAt: string
  sourceUpdatedAt: string | null
  licence: string
  licenceUrl: string
  attribution: string
}

export interface OfflineRegion {
  id: 'loddon-campaspe' | 'vic'
  name: string
  lgas: { code: string; name: string }[]
  /** [minLng, minLat, maxLng, maxLat] */
  bbox: [number, number, number, number]
}

export interface OfflineDataFile<T> {
  schemaVersion: 1
  dataVersion: string
  generatedAt: string
  region: OfflineRegion
  notes: string[]
  sources: OfflineSource[]
  records: T[]
}

export type OfflineServiceFile = OfflineDataFile<OfflineServiceRecord>
export type PostcodesFile = OfflineDataFile<PostcodeRecord>
export type LocalitiesFile = OfflineDataFile<LocalityRecord>

export type OfflineDataFileName =
  | 'offline-wifi.json'
  | 'offline-charities.json'
  | 'offline-emergency-services.json'
  | 'postcodes.json'
  | 'localities.json'

export interface OfflineManifestEntry {
  file: OfflineDataFileName
  dataVersion: string
  recordCount: number
  bytes: number
  sha256: string
}

export interface OfflineManifest {
  schemaVersion: 1
  generatedAt: string
  files: OfflineManifestEntry[]
}
