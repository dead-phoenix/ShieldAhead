import type {
  DatasetMetadata,
  SupportService,
  WifiLocation,
} from '../../../data/contracts'
import type { MapDataOrigin, MapPlace } from '../model/mapTypes'

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

