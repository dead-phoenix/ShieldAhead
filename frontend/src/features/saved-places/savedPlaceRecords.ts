import type { SupportService, WifiLocation } from '../../data/contracts'
import type {
  SavedPlace,
  SavedPlaceInput,
  SavedPlaceKind,
  SavedPlaceRecord,
} from '../../storage/savedPlacesStorage'
import type { MapPlace } from '../map/model/mapTypes'

const WIFI_SITE_PREFIX = 'wifi-site:'

export function savedPlaceKey(kind: SavedPlaceKind, id: string): string {
  return `${kind}:${id}`
}

export function savedPlaceLocality(record: Pick<SavedPlaceRecord, 'suburb' | 'postcode'>): string {
  const suburb = record.suburb && record.suburb !== 'Area not confirmed' ? record.suburb : ''
  return [suburb, record.postcode ? `VIC ${record.postcode}` : ''].filter(Boolean).join(' ')
}

function kindForPlace(place: MapPlace): SavedPlaceKind {
  if (place.kind === 'wifi') return 'wifi'
  if (place.kind === 'support') return 'support'
  return 'facility'
}

/** Grouped Wi-Fi sites get a key from their name and postcode, so the same site
 * keeps one key whichever area it was found from. */
function recordIdForPlace(place: MapPlace): string {
  return place.id.startsWith(WIFI_SITE_PREFIX)
    ? `site:${place.id.slice(WIFI_SITE_PREFIX.length)}`
    : place.sourceId
}

export function savedPlaceFromMapPlace(place: MapPlace): SavedPlaceInput {
  const kind = kindForPlace(place)
  const id = recordIdForPlace(place)
  const record: SavedPlaceRecord = {
    id,
    placeType: place.kind,
    name: place.name,
    address: place.address,
    suburb: place.suburb,
    postcode: place.postcode,
    latitude: place.latitude,
    longitude: place.longitude,
    phone: place.phone,
    website: place.website,
    openingHours: place.openingHours,
    accessConditions: place.accessConditions,
    serviceTypes: place.serviceTypes,
    eligibility: place.eligibility,
    verificationStatus: place.verificationStatus,
    partnerStatus: place.partnerStatus,
    availabilityStatus: place.availabilityStatus,
    availabilityUpdatedAt: place.availabilityUpdatedAt,
    availabilityFreshness: place.availabilityFreshness,
    accessPoints: place.accessPoints,
    dataUpdatedAt: place.dataUpdatedAt,
  }
  return { key: savedPlaceKey(kind, id), kind, record }
}

export function savedPlaceFromSupportService(service: SupportService): SavedPlaceInput {
  const record: SavedPlaceRecord = {
    id: service.id,
    placeType: 'support',
    name: service.name,
    address: service.address,
    suburb: service.suburb,
    postcode: service.postcode,
    latitude: service.latitude,
    longitude: service.longitude,
    phone: service.phone,
    website: service.website,
    serviceTypes: service.serviceTypes,
    eligibility: service.eligibility,
    partnerStatus: service.partnerStatus,
    availabilityStatus: service.availabilityStatus,
    availabilityUpdatedAt: service.availabilityUpdatedAt,
    availabilityFreshness: service.availabilityFreshness,
    dataUpdatedAt: service.dataUpdatedAt,
  }
  return { key: savedPlaceKey('support', service.id), kind: 'support', record }
}

export function savedPlaceFromWifiLocation(location: WifiLocation): SavedPlaceInput {
  const record: SavedPlaceRecord = {
    id: location.id,
    placeType: 'wifi',
    name: location.name,
    address: location.address,
    suburb: location.suburb,
    postcode: location.postcode,
    latitude: location.latitude,
    longitude: location.longitude,
    openingHours: location.openingHours,
    accessConditions: location.accessConditions,
    verificationStatus: location.verificationStatus,
    dataUpdatedAt: location.dataUpdatedAt,
  }
  return { key: savedPlaceKey('wifi', location.id), kind: 'wifi', record }
}

export function supportServiceFromSavedPlace(place: SavedPlace): SupportService {
  const { record } = place
  return {
    id: record.id,
    name: record.name,
    serviceTypes: record.serviceTypes ?? ['Community support services'],
    address: record.address,
    suburb: record.suburb ?? 'Area not confirmed',
    postcode: record.postcode ?? '',
    latitude: record.latitude,
    longitude: record.longitude,
    phone: record.phone,
    website: record.website,
    eligibility: record.eligibility,
    partnerStatus: record.partnerStatus,
    availabilityStatus: record.availabilityStatus ?? 'not-confirmed',
    availabilityUpdatedAt: record.availabilityUpdatedAt,
    availabilityFreshness: record.availabilityFreshness,
    dataUpdatedAt: record.dataUpdatedAt,
  }
}

export function wifiLocationFromSavedPlace(place: SavedPlace): WifiLocation {
  const { record } = place
  return {
    id: record.id,
    name: record.name,
    address: record.address,
    suburb: record.suburb ?? 'Area not confirmed',
    postcode: record.postcode ?? '',
    latitude: record.latitude,
    longitude: record.longitude,
    openingHours: record.openingHours,
    accessConditions: record.accessConditions,
    verificationStatus: record.verificationStatus,
    dataUpdatedAt: record.dataUpdatedAt,
  }
}
