import type { MapPlaceKind } from './mapTypes'

export interface MapPlaceKindPresentation {
  label: string
  singularLabel: string
  markerLabel: string
  filterEnabled: boolean
}

export const mapPlaceKindPresentation: Record<
  MapPlaceKind,
  MapPlaceKindPresentation
> = {
  wifi: {
    label: 'Free Wi-Fi',
    singularLabel: 'Free Wi-Fi location',
    markerLabel: 'Wi-Fi',
    filterEnabled: true,
  },
  support: {
    label: 'Charity and community support',
    singularLabel: 'Charity or community support service',
    markerLabel: 'Support',
    filterEnabled: true,
  },
  police: {
    label: 'Police',
    singularLabel: 'Police station',
    markerLabel: 'Police',
    filterEnabled: true,
  },
  fire: {
    label: 'Fire stations',
    singularLabel: 'Fire station',
    markerLabel: 'Fire',
    filterEnabled: true,
  },
  hospital: {
    label: 'Hospitals',
    singularLabel: 'Hospital',
    markerLabel: 'Hospital',
    filterEnabled: true,
  },
  ambulance: {
    label: 'Ambulance stations',
    singularLabel: 'Ambulance station',
    markerLabel: 'Ambulance',
    filterEnabled: true,
  },
}

export const enabledMapPlaceKinds = Object.entries(mapPlaceKindPresentation)
  .filter(([, presentation]) => presentation.filterEnabled)
  .map(([kind]) => kind as MapPlaceKind)

