import type { SupportService, WifiLocation } from '../../data/contracts'

export type MapRecordKind = 'wifi' | 'support'

export interface MapRecord {
  id: string
  kind: MapRecordKind
  name: string
  latitude: number
  longitude: number
  markerLabel: string
  status?: 'confirmed' | 'likely'
  previewStatus: string
  previewLines: string[]
}

function hasValidCoordinates<T extends {
  latitude?: number
  longitude?: number
}>(record: T): record is T & { latitude: number; longitude: number } {
  return typeof record.latitude === 'number'
    && Number.isFinite(record.latitude)
    && record.latitude >= -90
    && record.latitude <= 90
    && typeof record.longitude === 'number'
    && Number.isFinite(record.longitude)
    && record.longitude >= -180
    && record.longitude <= 180
}

export function wifiMapRecords(locations: WifiLocation[]): MapRecord[] {
  return locations.filter(hasValidCoordinates).map((location) => ({
    id: location.id,
    kind: 'wifi',
    name: location.name,
    latitude: location.latitude,
    longitude: location.longitude,
    markerLabel: location.verificationStatus === 'confirmed'
      ? 'Confirmed'
      : location.verificationStatus === 'likely'
        ? 'Likely'
        : 'Wi-Fi',
    status: location.verificationStatus,
    previewStatus: location.verificationStatus === 'confirmed'
      ? 'Confirmed Wi-Fi listing'
      : location.verificationStatus === 'likely'
        ? 'Wi-Fi likely — check first'
        : 'Wi-Fi availability not confirmed',
    previewLines: [
      `${location.address ? `${location.address}, ` : ''}${location.suburb} VIC ${location.postcode}${location.distanceKm === undefined ? '' : ` · ${location.distanceKm} km`}`,
      location.openingHours ?? 'Opening hours not confirmed',
    ],
  }))
}

export function supportMapRecords(services: SupportService[]): MapRecord[] {
  return services.filter(hasValidCoordinates).map((service) => ({
    id: service.id,
    kind: 'support',
    name: service.name,
    latitude: service.latitude,
    longitude: service.longitude,
    markerLabel: 'Support',
    previewStatus: service.availabilityStatus === 'normal'
      ? 'Availability reported as normal'
      : service.availabilityStatus === 'closed'
        ? 'Reported closed — check first'
        : service.availabilityStatus === 'low'
          ? 'Low availability reported'
          : 'Support service',
    previewLines: [
      `${service.address ? `${service.address}, ` : ''}${service.suburb} VIC ${service.postcode}${service.distanceKm === undefined ? '' : ` · ${service.distanceKm} km`}`,
      service.phone ?? 'Phone not published',
    ],
  }))
}
