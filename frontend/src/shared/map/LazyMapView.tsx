import { Component, lazy, Suspense, useCallback, useState, type ReactNode } from 'react'
import type { MapRecord } from './mapRecords'
import type { RoutePreview } from '../../data/api/directionsApi'
import type { RoutePoint } from '../../data/api/directionsApi'
import type { LivePositionPoint, MapViewport, SearchMarkerPoint } from './MapView'

/** React.lazy keeps a failed import forever, so a retry needs a new lazy component. */
function createLazyMapView() {
  return lazy(async () => {
    const module = await import('./MapView')
    return { default: module.MapView }
  })
}

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
  searchMarker?: SearchMarkerPoint
  livePosition?: LivePositionPoint
}

interface MapLoadBoundaryProps {
  children: ReactNode
  onReturnToList: () => void
  onRetry: () => void
}

class MapLoadBoundary extends Component<MapLoadBoundaryProps, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error('The map could not be loaded.', error)
    window.addEventListener('online', this.props.onRetry, { once: true })
  }

  componentWillUnmount() {
    window.removeEventListener('online', this.props.onRetry)
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="map-unavailable" role="alert">
          <strong>The map could not be displayed</strong>
          <p>Use the list view to read all nearby results.</p>
          <button className="button button--quiet" type="button" onClick={this.props.onRetry}>Try again</button>
          <button className="button button--quiet" type="button" onClick={this.props.onReturnToList}>Return to list</button>
        </div>
      )
    }
    return this.props.children
  }
}

export function LazyMapView(props: LazyMapViewProps) {
  const [loader, setLoader] = useState(() => ({ attempt: 0, MapView: createLazyMapView() }))
  const retry = useCallback(() => {
    setLoader((current) => ({ attempt: current.attempt + 1, MapView: createLazyMapView() }))
  }, [])
  const { attempt, MapView } = loader

  return (
    <MapLoadBoundary key={attempt} onReturnToList={props.onReturnToList} onRetry={retry}>
      <Suspense fallback={<div className="map-unavailable" role="status">Preparing map…</div>}>
        <MapView {...props} />
      </Suspense>
    </MapLoadBoundary>
  )
}
