import type { DirectionsPanelState } from '../../../shared/map/DirectionsPanel'
import type { ResultsView } from '../../../shared/map/ListMapToggle'
import type { MapViewport } from '../../../shared/map/MapView'
import type { SearchLocation } from '../../../storage/searchLocationStorage'
import type { MapPlaceKind } from './mapTypes'

export type MapPanelMode = 'results' | 'details' | 'directions'
export type MobilePanelSize = 'compact' | 'half' | 'full'

export interface MapSessionState {
  area: SearchLocation
  query: string
  selectedKinds: MapPlaceKind[]
  serviceFilter?: string
  selectedPlaceId?: string
  panelMode: MapPanelMode
  mobileView: ResultsView
  panelSize: MobilePanelSize
  listScrollTop: number
  viewport?: MapViewport
  directions?: DirectionsPanelState
}

const SESSION_KEY = 'shieldahead.map.session.v1'

export function readMapSessionState(): MapSessionState | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<MapSessionState>
    if (!value.area?.postcode || typeof value.area.label !== 'string') return null
    if (!Array.isArray(value.selectedKinds)) return null
    return {
      area: value.area,
      query: typeof value.query === 'string' ? value.query : value.area.label,
      selectedKinds: value.selectedKinds,
      ...(typeof value.serviceFilter === 'string' ? { serviceFilter: value.serviceFilter } : {}),
      selectedPlaceId: typeof value.selectedPlaceId === 'string' ? value.selectedPlaceId : undefined,
      panelMode: value.panelMode === 'details' || value.panelMode === 'directions' ? value.panelMode : 'results',
      mobileView: value.mobileView === 'list' ? 'list' : 'map',
      panelSize: value.panelSize === 'compact' || value.panelSize === 'full' ? value.panelSize : 'half',
      listScrollTop: typeof value.listScrollTop === 'number' ? value.listScrollTop : 0,
      viewport: value.viewport,
      directions: value.directions,
    }
  } catch {
    return null
  }
}

export function saveMapSessionState(state: MapSessionState): void {
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(state))
  } catch {
    // The Map remains usable when private browsing or storage policy blocks session storage.
  }
}
