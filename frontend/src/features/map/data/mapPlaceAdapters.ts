import type {
  DatasetMetadata,
  EmergencyFacility,
  FacilityType,
  SupportService,
  WifiLocation,
} from '../../../data/contracts'
import type { MapDataOrigin, MapPlace, MapPlaceKind } from '../model/mapTypes'

const facilityTypeToKind: Record<FacilityType, MapPlaceKind> = {
  Hospital: 'hospital',
  'Police Station': 'police',
  'Fire Station': 'fire',
  'Ambulance Station': 'ambulance',
}

export function metadataOrigin(metadata: DatasetMetadata): MapDataOrigin {
  return metadata.dataOrigin === 'cache' || Boolean(metadata.cachedAt)
    ? 'cache'
    : 'network'
}

export function wifiLocationToMapPlace(
  location: WifiLocation,
  dataOrigin: MapDataOrigin,
): MapPlace {
  return {
    id: `wifi:${location.id}`,
    sourceId: location.id,
    source: 'wifi',
    kind: 'wifi',
    name: location.name,
    address: location.address,
    suburb: location.suburb,
    postcode: location.postcode,
    latitude: location.latitude,
    longitude: location.longitude,
    distanceKm: location.distanceKm,
    openingHours: location.openingHours,
    accessConditions: location.accessConditions,
    verificationStatus: location.verificationStatus,
    dataUpdatedAt: location.dataUpdatedAt,
    dataOrigin,
  }
}

export function supportServiceToMapPlace(
  service: SupportService,
  dataOrigin: MapDataOrigin,
): MapPlace {
  return {
    id: `support:${service.id}`,
    sourceId: service.id,
    source: 'support',
    kind: 'support',
    name: service.name,
    address: service.address,
    suburb: service.suburb,
    postcode: service.postcode,
    latitude: service.latitude,
    longitude: service.longitude,
    distanceKm: service.distanceKm,
    phone: service.phone,
    website: service.website,
    serviceTypes: service.serviceTypes,
    eligibility: service.eligibility,
    partnerStatus: service.partnerStatus,
    availabilityStatus: service.availabilityStatus,
    availabilityUpdatedAt: service.availabilityUpdatedAt,
    availabilityFreshness: service.availabilityFreshness,
    dataUpdatedAt: service.dataUpdatedAt,
    dataOrigin,
  }
}

export function emergencyFacilityToMapPlace(facility: EmergencyFacility): MapPlace {
  return {
    id: `emergency:${facility.id}`,
    sourceId: facility.id,
    source: 'emergency',
    kind: facilityTypeToKind[facility.facilityType],
    name: facility.name,
    address: facility.address,
    suburb: facility.suburb,
    postcode: facility.postcode,
    latitude: facility.latitude,
    longitude: facility.longitude,
    distanceKm: facility.distanceKm,
    phone: facility.phone,
    dataUpdatedAt: facility.dataUpdatedAt,
    // Fetched directly (not through the offline-aware repository/cache
    // layer the wifi/support sources use), so it is always this run's
    // live result rather than a saved copy.
    dataOrigin: 'network',
  }
}

