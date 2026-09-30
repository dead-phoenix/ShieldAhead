import { Component, lazy, Suspense, type ReactNode } from 'react'
import type { MapRecord } from './mapRecords'
import type { RoutePreview } from '../../data/api/directionsApi'
import type { RoutePoint } from '../../data/api/directionsApi'
import type { MapViewport } from './MapView'

const MapView = lazy(async () => {
  const module = await import('./MapView')
  return { default: module.MapView }
})

interface LazyMapViewProps {
  ariaLabel: string
  markers: MapRecord[]
  selectedIds?: string[]
  onSelect: (ids: string[]) => void
  onReturnToList: () => void
  route?: RoutePreview
  isSelectingStart?: boolean
  onSelectStart?: (point: RoutePoint) => void
  onViewportSettled?: (point: RoutePoint) => void
  initialViewport?: MapViewport
  onViewportChange?: (viewport: MapViewport) => void
  routeRecentreKey?: number
  focusSelectedMarker?: boolean
}

class MapLoadBoundary extends Component<{ children: ReactNode; onReturnToList: () => void }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="map-unavailable" role="alert">
          <strong>The map could not be displayed</strong>
          <p>Use the list view to read all nearby results.</p>
          <button className="button button--quiet" type="button" onClick={this.props.onReturnToList}>Return to list</button>
        </div>
      )
    }
    return this.props.children
  }
}

export function LazyMapView(props: LazyMapViewProps) {
  return (
    <MapLoadBoundary onReturnToList={props.onReturnToList}>
      <Suspense fallback={<div className="map-unavailable" role="status">Preparing map…</div>}>
        <MapView {...props} />
      </Suspense>
    </MapLoadBoundary>
  )
}
