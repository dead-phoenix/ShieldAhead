import type { DirectionsProfile, RoutePoint, RoutePreview } from '../../../data/api/directionsApi'

export interface SavedOfflineRoute {
  destinationId: string
  destinationName: string
  destinationLatitude: number
  destinationLongitude: number
  profile: DirectionsProfile
  origin: RoutePoint
  originLabel: string
  route: RoutePreview
  savedAt: string
}

const STORAGE_KEY = 'shieldahead.map.offlineRoutes.v1'
// Small cap — this is for "the handful of routes someone actually planned
// before losing signal," not a general route history.
const MAX_SAVED_ROUTES = 5

function isRoutePoint(value: unknown): value is RoutePoint {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.latitude === 'number' && typeof record.longitude === 'number'
}

function isSavedOfflineRoute(value: unknown): value is SavedOfflineRoute {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.destinationId === 'string'
    && typeof record.destinationName === 'string'
    && typeof record.destinationLatitude === 'number'
    && typeof record.destinationLongitude === 'number'
    && typeof record.profile === 'string'
    && typeof record.originLabel === 'string'
    && isRoutePoint(record.origin)
    && typeof record.savedAt === 'string'
    && typeof record.route === 'object' && record.route !== null
}

function readAll(): SavedOfflineRoute[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter(isSavedOfflineRoute) : []
  } catch {
    return []
  }
}

/** Saves a calculated route so it can still be opened with no network —
 * e.g. a route to the nearest hospital or wifi point, planned while online,
 * still usable if signal is lost later. Keyed by destination, so planning
 * routes to a few different places keeps each of them available. */
export function saveOfflineRoute(entry: Omit<SavedOfflineRoute, 'savedAt'>): void {
  try {
    const existing = readAll().filter((saved) => saved.destinationId !== entry.destinationId)
    const next = [{ ...entry, savedAt: new Date().toISOString() }, ...existing].slice(0, MAX_SAVED_ROUTES)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Saving for offline use is a bonus on top of the live route — a full
    // or blocked storage quota shouldn't stop the route being used now.
  }
}

export function readOfflineRoute(destinationId: string): SavedOfflineRoute | undefined {
  return readAll().find((saved) => saved.destinationId === destinationId)
}
