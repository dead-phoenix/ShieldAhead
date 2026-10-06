import type {
  AvailabilityStatus,
  DatasetMetadata,
  SupportService,
  WifiLocation,
} from '../../../data/contracts'

export type MapPlaceKind =
  | 'wifi'
  | 'support'
  | 'police'
  | 'fire'
  | 'hospital'
  | 'ambulance'

export type MapPlaceSource = 'wifi' | 'support' | 'emergency'
export type MapDataOrigin = 'network' | 'cache'

export interface MapAccessPoint {
  name: string
  latitude?: number
  longitude?: number
}

export interface MapPlace {
  id: string
  sourceId: string
  source: MapPlaceSource
  kind: MapPlaceKind
  name: string
  address?: string
  suburb?: string
  postcode?: string
  latitude?: number
  longitude?: number
  distanceKm?: number
  phone?: string
  website?: string
  openingHours?: string
  accessConditions?: string[]
  serviceTypes?: string[]
  eligibility?: string
  verificationStatus?: WifiLocation['verificationStatus']
  partnerStatus?: SupportService['partnerStatus']
  availabilityStatus?: AvailabilityStatus
  availabilityUpdatedAt?: string
  availabilityFreshness?: SupportService['availabilityFreshness']
  /** Individual Wi-Fi access points grouped under this one site. */
  accessPoints?: MapAccessPoint[]
  dataUpdatedAt: string
  dataOrigin: MapDataOrigin
}

export interface NearbyPlacesQuery {
  postcode: string
  latitude?: number
  longitude?: number
  radiusKm?: number
  kinds?: MapPlaceKind[]
}

export interface MapPlaceDataset {
  source: Exclude<MapPlaceSource, 'emergency'>
  metadata: DatasetMetadata
}

export interface MapPlaceSourceError {
  source: Exclude<MapPlaceSource, 'emergency'>
  message: string
}

export interface MapPlaceResult {
  places: MapPlace[]
  datasets: MapPlaceDataset[]
  sourceErrors: MapPlaceSourceError[]
  generatedAt: string
  limitations: string[]
  dataOrigin: MapDataOrigin | 'mixed'
}

export interface MapPlaceRepository {
  findNearby(query: NearbyPlacesQuery): Promise<MapPlaceResult>
}

