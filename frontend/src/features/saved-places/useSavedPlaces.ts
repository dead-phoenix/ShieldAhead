import { useSyncExternalStore } from 'react'
import { readSavedPlaces, subscribeToSavedPlaces, type SavedPlace } from '../../storage/savedPlacesStorage'

export function useSavedPlaces(): SavedPlace[] {
  return useSyncExternalStore(subscribeToSavedPlaces, readSavedPlaces, readSavedPlaces)
}
