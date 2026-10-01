import type { MapPlace, MapPlaceKind } from './mapTypes'

/** Charity tags inferred from published charity information. Chip labels are shorter than the stored service type. */
export const supportServiceFilters = [
  { id: 'food', label: 'Food', serviceType: 'Food relief' },
  { id: 'emergency', label: 'Emergency relief', serviceType: 'Emergency relief' },
  { id: 'financial', label: 'Financial', serviceType: 'Financial counselling / hardship support' },
  { id: 'family-violence', label: 'Family violence', serviceType: 'Family violence support' },
  { id: 'mental-health', label: 'Mental health', serviceType: 'Mental health support' },
  { id: 'counselling', label: 'Counselling', serviceType: 'Counselling services' },
  { id: 'housing', label: 'Housing', serviceType: 'Housing support' },
  { id: 'homelessness', label: 'Homelessness', serviceType: 'Homelessness support' },
  { id: 'youth', label: 'Youth', serviceType: 'Youth services' },
  { id: 'aged-care', label: 'Aged care', serviceType: 'Aged care support' },
  { id: 'disability', label: 'Disability', serviceType: 'Disability support' },
  { id: 'community', label: 'Community', serviceType: 'Community support services' },
] as const

export type MapResultFilter =
  | { mode: 'all' }
  | { mode: 'wifi' }
  | { mode: 'support' }
  | { mode: 'tag'; serviceType: string }

export function filterKey(filter: MapResultFilter): string {
  return filter.mode === 'tag' ? `tag:${filter.serviceType}` : filter.mode
}

export function parseMapResultFilter(value: string | null | undefined): MapResultFilter | null {
  if (!value || value === 'all') return value === 'all' ? { mode: 'all' } : null
  if (value === 'wifi' || value === 'support') return { mode: value }
  if (value.startsWith('tag:')) {
    const serviceType = value.slice(4)
    if (supportServiceFilters.some((item) => item.serviceType === serviceType)) {
      return { mode: 'tag', serviceType }
    }
  }
  return null
}

export function placeMatchesFilter(place: MapPlace, filter: MapResultFilter): boolean {
  if (place.kind !== 'wifi' && place.kind !== 'support') return false
  if (filter.mode === 'all') return true
  if (filter.mode === 'wifi') return place.kind === 'wifi'
  if (filter.mode === 'support') return place.kind === 'support'
  return place.kind === 'support' && (place.serviceTypes ?? []).includes(filter.serviceType)
}

export function kindsForFilter(filter: MapResultFilter): MapPlaceKind[] {
  if (filter.mode === 'all') return ['wifi', 'support']
  if (filter.mode === 'wifi') return ['wifi']
  return ['support']
}
