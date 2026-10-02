import type { MapRecord } from '../../../shared/map/mapRecords'
import { mapPlaceKindPresentation } from '../model/mapPlacePresentation'
import type { MapPlace } from '../model/mapTypes'

export function mapPlaceHasCoordinates(place: MapPlace): place is MapPlace & {
  latitude: number
  longitude: number
} {
  return typeof place.latitude === 'number'
    && Number.isFinite(place.latitude)
    && place.latitude >= -90
    && place.latitude <= 90
    && typeof place.longitude === 'number'
    && Number.isFinite(place.longitude)
    && place.longitude >= -180
    && place.longitude <= 180
}

export function mapPlacesToMapRecords(places: MapPlace[]): MapRecord[] {
  return places
    .filter(mapPlaceHasCoordinates)
    .map((place) => ({
    id: place.id,
    kind: place.kind,
    name: place.name,
    latitude: place.latitude,
    longitude: place.longitude,
    markerLabel: mapPlaceKindPresentation[place.kind].markerLabel,
    status: place.kind === 'wifi' ? place.verificationStatus : undefined,
    previewStatus: place.kind === 'wifi'
      ? place.verificationStatus === 'confirmed'
        ? 'Confirmed Wi-Fi listing'
        : 'Wi-Fi availability not confirmed'
      : place.kind === 'support'
        ? 'Charity or community support'
        : mapPlaceKindPresentation[place.kind].singularLabel,
    previewLines: [
      [place.address, place.suburb, place.postcode].filter(Boolean).join(', ') || 'Address not provided',
      place.distanceKm === undefined ? 'Distance not confirmed' : `${place.distanceKm} km away`,
    ],
    }))
}
