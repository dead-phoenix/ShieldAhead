import { useCallback, useEffect, useRef, useState } from 'react'
import {
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  Popup,
  setWorkerUrl,
} from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { MapRecord } from './mapRecords'
import type { RoutePreview } from '../../data/api/directionsApi'
import type { RoutePoint } from '../../data/api/directionsApi'

setWorkerUrl(workerUrl)

const defaultStyleUrl = 'https://tiles.openfreemap.org/styles/liberty'
const svgNamespace = 'http://www.w3.org/2000/svg'
// How far the initial auto-fit is allowed to zoom OUT when markers span a
// wide area (e.g. a couple of far-flung emergency facilities alongside a
// tight local cluster of wifi/support pins). Roughly a "local area" view —
// far enough out to still look reasonable, close enough that the nearby
// cluster isn't shrunk to an unreadable dot.
const MIN_AUTOFIT_ZOOM = 12
// A dense city search (lots of wifi/charity points genuinely packed into a
// few blocks, like central Melbourne) can still produce dozens of visible
// markers even once zoomed to MIN_AUTOFIT_ZOOM, which reads as clutter
// rather than "too far out" — the bounds-based zoom alone can't tell those
// two cases apart. Past this many markers, zoom in further regardless of
// what the bounds say, trading a few now-offscreen distant markers (still
// reachable by panning) for a readable initial view.
const DENSE_MARKER_COUNT_THRESHOLD = 40
const DENSE_MARKER_MIN_ZOOM = 15
const markerIconPaths = {
  wifi: 'M144,204a16,16,0,1,1-16-16A16,16,0,0,1,144,204ZM239.61,83.91a176,176,0,0,0-223.22,0,12,12,0,1,0,15.23,18.55,152,152,0,0,1,192.76,0,12,12,0,1,0,15.23-18.55Zm-32.16,35.73a128,128,0,0,0-158.9,0,12,12,0,0,0,14.9,18.81,104,104,0,0,1,129.1,0,12,12,0,0,0,14.9-18.81ZM175.07,155.3a80.05,80.05,0,0,0-94.14,0,12,12,0,0,0,14.14,19.4,56,56,0,0,1,65.86,0,12,12,0,1,0,14.14-19.4Z',
  support: 'M232.76,137.88a28.66,28.66,0,0,0-12-5.39C236.19,114.94,244,97.37,244,80c0-28.67-23.09-52-51.46-52A51.77,51.77,0,0,0,156,42.85,51.77,51.77,0,0,0,119.46,28C91.09,28,68,51.33,68,80c0,10.15,2.72,20.3,8.22,30.7a35.9,35.9,0,0,0-11.73,7.84L43,140H20A20,20,0,0,0,0,160v40a20,20,0,0,0,20,20H120a11.89,11.89,0,0,0,2.91-.36l64-16a11.4,11.4,0,0,0,1.79-.6l38.82-16.54c.23-.09.45-.19.67-.3a28.61,28.61,0,0,0,4.57-48.32ZM119.46,52A27.18,27.18,0,0,1,144.9,68.56a12,12,0,0,0,22.2,0A27.18,27.18,0,0,1,192.54,52C207.42,52,220,64.82,220,80c0,18.06-15,38.84-43.38,60.19L172,141.26c0-.42,0-.84,0-1.26a32,32,0,0,0-32-32H102.71C95.42,97.76,92,88.77,92,80,92,64.82,104.58,52,119.46,52ZM24,164H36v32H24Zm193.68.61-37.51,16L118.52,196H60V157l21.46-21.46A11.93,11.93,0,0,1,89.94,132H140a8,8,0,0,1,0,16H112a12,12,0,0,0,0,24h32a12.19,12.19,0,0,0,2.69-.3l67-15.41.47-.12a4.61,4.61,0,0,1,5.82,4.44A4.58,4.58,0,0,1,217.68,164.61Z',
  hospital: 'M248,208h-8V128a16,16,0,0,0-16-16H168V48a16,16,0,0,0-16-16H56A16,16,0,0,0,40,48V208H32a8,8,0,0,0,0,16H248a8,8,0,0,0,0-16Zm-24-80v80H168V128ZM56,48h96V208H136V160a8,8,0,0,0-8-8H80a8,8,0,0,0-8,8v48H56Zm64,160H88V168h32ZM72,96a8,8,0,0,1,8-8H96V72a8,8,0,0,1,16,0V88h16a8,8,0,0,1,0,16H112v16a8,8,0,0,1-16,0V104H80A8,8,0,0,1,72,96Z',
  police: 'M208,40H48A16,16,0,0,0,32,56v56c0,52.72,25.52,84.67,46.93,102.19,23.06,18.86,46,25.27,47,25.53a8,8,0,0,0,4.2,0c1-.26,23.91-6.67,47-25.53C198.48,196.67,224,164.72,224,112V56A16,16,0,0,0,208,40Zm0,16v56c0,2.71-.08,5.37-.23,8H136V56ZM48,56h72v64H48.23c-.15-2.63-.23-5.29-.23-8Zm2.06,80H120v84.55a130.85,130.85,0,0,1-30.93-18.74C67.92,184.51,54.87,162.44,50.08,136ZM167.4,201.42A131.31,131.31,0,0,1,136,220.53V136h69.91C201.16,162.24,188.27,184.18,167.4,201.42Z',
  fire: 'M183.89,153.34a57.6,57.6,0,0,1-46.56,46.55A8.75,8.75,0,0,1,136,200a8,8,0,0,1-1.32-15.89c16.57-2.79,30.63-16.85,33.44-33.45a8,8,0,0,1,15.78,2.68ZM216,144a88,88,0,0,1-176,0c0-27.92,11-56.47,32.66-84.85a8,8,0,0,1,11.93-.89l24.12,23.41,22-60.41a8,8,0,0,1,12.63-3.41C165.21,36,216,84.55,216,144Zm-16,0c0-46.09-35.79-85.92-58.21-106.33L119.52,98.74a8,8,0,0,1-13.09,3L80.06,76.16C64.09,99.21,56,122,56,144a72,72,0,0,0,144,0Z',
  ambulance: 'M80,120a8,8,0,0,1,8-8h16V96a8,8,0,0,1,16,0v16h16a8,8,0,0,1,0,16H120v16a8,8,0,0,1-16,0V128H88A8,8,0,0,1,80,120Zm176,0v64a16,16,0,0,1-16,16H223a32,32,0,0,1-62,0H111a32,32,0,0,1-62,0H32a16,16,0,0,1-16-16V72A16,16,0,0,1,32,56H184a8,8,0,0,1,8,8v8h34.58a15.93,15.93,0,0,1,14.86,10.06l14,35A7.92,7.92,0,0,1,256,120ZM192,88v24h44.18l-9.6-24ZM32,184H49a32,32,0,0,1,62,0h50a32.11,32.11,0,0,1,15-19.69V72H32Zm64,8a16,16,0,1,0-16,16A16,16,0,0,0,96,192Zm112,0a16,16,0,1,0-16,16A16,16,0,0,0,208,192Zm32-8V128H192v32a32.06,32.06,0,0,1,31,24Z',
} as const

const markerGroupLabels: Partial<Record<MapRecord['kind'], string>> = {
  wifi: 'Wi-Fi locations',
  support: 'support services',
  hospital: 'hospitals',
  police: 'police stations',
  fire: 'fire stations',
  ambulance: 'ambulance stations',
}

function appendMarkerContents(button: HTMLButtonElement, record: MapRecord, count: number) {
  const icon = document.createElementNS(svgNamespace, 'svg')
  icon.setAttribute('aria-hidden', 'true')
  icon.setAttribute('viewBox', '0 0 256 256')
  icon.setAttribute('width', '23')
  icon.setAttribute('height', '23')
  icon.setAttribute('fill', 'currentColor')
  const path = document.createElementNS(svgNamespace, 'path')
  path.setAttribute('d', markerIconPaths[record.kind])
  icon.append(path)
  button.append(icon)

  if (count > 1) {
    const badge = document.createElement('span')
    badge.className = 'map-marker__count'
    badge.setAttribute('aria-hidden', 'true')
    badge.textContent = String(count)
    button.append(badge)
  }
}

function createPreviewContent(record: MapRecord, count: number): HTMLDivElement {
  const content = document.createElement('div')
  content.className = 'marker-popup'
  const title = document.createElement('strong')
  title.textContent = count > 1 ? `${count} ${markerGroupLabels[record.kind] ?? 'locations'}` : record.name
  content.append(title)
  const status = document.createElement('span')
  status.className = 'marker-popup__status'
  status.textContent = count > 1 ? 'Select to choose a location' : record.previewStatus
  content.append(status)
  if (count === 1) {
    record.previewLines.forEach((line) => {
      const detail = document.createElement('small')
      detail.textContent = line
      content.append(detail)
    })
  }
  return content
}

export interface SearchMarkerPoint {
  latitude: number
  longitude: number
  label: string
}

export interface LivePositionPoint {
  latitude: number
  longitude: number
  /** Degrees clockwise from true north — shows a direction cone when known. */
  heading?: number
}

interface MapViewProps {
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
  /** A single pin for the place the user searched for, shown distinctly
   * from the wifi/support markers — like Google Maps drops a pin exactly
   * where you searched. The map centres on it when it's set. */
  searchMarker?: SearchMarkerPoint
  /** The traveller's live GPS position during active navigation, shown as
   * a distinct blue "puck" marker rather than one of the pin-style markers. */
  livePosition?: LivePositionPoint
}

export interface MapViewport extends RoutePoint {
  zoom: number
}

function groupMarkersByPosition(markers: MapRecord[]): MapRecord[][] {
  const groups = new Map<string, MapRecord[]>()
  markers.forEach((marker) => {
    const key = `${marker.latitude.toFixed(6)},${marker.longitude.toFixed(6)}`
    groups.set(key, [...(groups.get(key) ?? []), marker])
  })
  return [...groups.values()]
}

export function MapView({ ariaLabel, markers, selectedIds = [], onSelect, onReturnToList, route, isSelectingStart = false, onSelectStart, onViewportSettled, initialViewport, onViewportChange, routeRecentreKey = 0, focusSelectedMarker = false, searchMarker, livePosition }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markerRefs = useRef<Marker[]>([])
  const searchMarkerRef = useRef<Marker | null>(null)
  const routeOriginMarkerRef = useRef<Marker | null>(null)
  const livePositionMarkerRef = useRef<Marker | null>(null)
  const markerButtonsRef = useRef(new Map<string, HTMLButtonElement>())
  const previewPopupRef = useRef<Popup | null>(null)
  const onSelectRef = useRef(onSelect)
  const latestSearchMarkerRef = useRef(searchMarker)
  const [isReady, setIsReady] = useState(false)
  const [hasFailed, setHasFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const initialViewportRef = useRef(initialViewport)
  const skipInitialMarkerFitRef = useRef(Boolean(initialViewport))
  // A restored search pin shouldn't force the camera back onto it on
  // load — the restored viewport already reflects wherever the user
  // actually left the map (which may have been panned away from the pin
  // since searching), and re-centring on mount would silently undo that.
  const skipInitialSearchRecentreRef = useRef(Boolean(initialViewport))

  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  useEffect(() => {
    latestSearchMarkerRef.current = searchMarker
  }, [searchMarker])

  useEffect(() => {
    if (!containerRef.current) return
    let styleReady = false
    let loadTimer: number | undefined

    try {
      const map = new MapLibreMap({
        container: containerRef.current,
        style: import.meta.env.VITE_MAP_STYLE_URL?.trim() || defaultStyleUrl,
        center: initialViewportRef.current
          ? [initialViewportRef.current.longitude, initialViewportRef.current.latitude]
          : [144.9631, -37.8136],
        zoom: initialViewportRef.current?.zoom ?? 9,
        attributionControl: {},
        cooperativeGestures: true,
      })
      map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
      map.once('styledata', () => {
        styleReady = true
        if (loadTimer) window.clearTimeout(loadTimer)
        setIsReady(true)
      })
      map.on('error', (event) => {
        if (styleReady) return
        console.error('The map style could not be loaded.', event.error)
        setHasFailed(true)
      })
      map.on('webglcontextlost', () => {
        console.error('The map lost its WebGL context.')
        setHasFailed(true)
      })
      mapRef.current = map
      loadTimer = window.setTimeout(() => {
        if (styleReady) return
        console.error('The map style did not load within 15 seconds.')
        setHasFailed(true)
      }, 15_000)
    } catch (reason) {
      console.error('The map could not be created.', reason)
      queueMicrotask(() => setHasFailed(true))
    }

    return () => {
      previewPopupRef.current?.remove()
      previewPopupRef.current = null
      markerRefs.current.forEach((marker) => marker.remove())
      markerRefs.current = []
      searchMarkerRef.current?.remove()
      searchMarkerRef.current = null
      livePositionMarkerRef.current?.remove()
      livePositionMarkerRef.current = null
      if (loadTimer) window.clearTimeout(loadTimer)
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [attempt])

  const retry = useCallback(() => {
    setIsReady(false)
    setHasFailed(false)
    setAttempt((current) => current + 1)
  }, [])

  useEffect(() => {
    if (!hasFailed) return
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [hasFailed, retry])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const markerButtons = markerButtonsRef.current

    markerRefs.current.forEach((marker) => marker.remove())
    markerButtons.clear()
    markerRefs.current = groupMarkersByPosition(markers).map((group) => {
      const record = group[0]
      const groupIds = group.map((item) => item.id)
      const button = document.createElement('button')
      button.type = 'button'
      const variant = record.kind === 'wifi' && record.status ? record.status : record.kind
      button.className = `map-marker map-marker--${variant}`
      const groupedLabel = `${group.length} ${markerGroupLabels[record.kind] ?? 'locations'} share this approximate map position`
      button.setAttribute('aria-label', group.length > 1 ? groupedLabel : `Show ${record.name} details`)
      button.title = group.length > 1 ? groupedLabel : record.name
      appendMarkerContents(button, record, group.length)
      button.addEventListener('click', (event) => {
        event.stopPropagation()
        onSelectRef.current(groupIds)
      })
      const showPreview = () => {
        previewPopupRef.current?.remove()
        previewPopupRef.current = new Popup({ closeButton: false, closeOnClick: false, offset: 28, maxWidth: '22rem' })
          .setLngLat([record.longitude, record.latitude])
          .setDOMContent(createPreviewContent(record, group.length))
          .addTo(map)
      }
      const hidePreview = () => {
        previewPopupRef.current?.remove()
        previewPopupRef.current = null
      }
      button.addEventListener('pointerenter', showPreview)
      button.addEventListener('pointerleave', hidePreview)
      button.addEventListener('focus', showPreview)
      button.addEventListener('blur', hidePreview)
      groupIds.forEach((id) => markerButtons.set(id, button))
      return new Marker({ element: button, anchor: 'bottom' })
        .setLngLat([record.longitude, record.latitude])
        .addTo(map)
    })

    if (markers.length === 0) {
      // Nothing to fit yet (data hasn't loaded) — leave the skip-fit flag
      // alone so it's still there once real markers actually arrive,
      // instead of being spent on this empty pre-load render.
    } else if (skipInitialMarkerFitRef.current && !focusSelectedMarker) {
      skipInitialMarkerFitRef.current = false
    } else if (markers.length === 1) {
      skipInitialMarkerFitRef.current = false
      const isMobile = window.matchMedia('(max-width: 55.99rem)').matches
      map.easeTo({
        center: [markers[0].longitude, markers[0].latitude],
        zoom: 14,
        padding: focusSelectedMarker && isMobile
          ? { top: 72, right: 24, bottom: 300, left: 24 }
          : undefined,
        duration: focusSelectedMarker ? 350 : 0,
      })
    } else if (markers.length > 1) {
      const bounds = new LngLatBounds()
      markers.forEach((record) => bounds.extend([record.longitude, record.latitude]))
      // A few sparse markers far from the rest (e.g. the nearest police/fire
      // station reaching well beyond a dense cluster of wifi/support pins)
      // can otherwise drag fitBounds out to a whole-region view. Clamp how
      // far it's allowed to zoom OUT so the common, nearby cluster stays
      // readable — every marker is still on the map and reachable by
      // panning or zooming out manually, just not force-fit into view.
      const camera = map.cameraForBounds(bounds, { padding: 56, maxZoom: 14 })
      const search = latestSearchMarkerRef.current
      if (camera?.center && camera.zoom !== undefined) {
        // Re-centre on what was actually searched for, not the bounding
        // box's centroid — a wide geographic spread (the sparse markers
        // above) can pull that centroid well away from the search point,
        // which is exactly the place this view needs to stay anchored on.
        const center = search ? [search.longitude, search.latitude] as [number, number] : camera.center
        const zoomFloor = markers.length >= DENSE_MARKER_COUNT_THRESHOLD ? DENSE_MARKER_MIN_ZOOM : MIN_AUTOFIT_ZOOM
        map.easeTo({ center, zoom: Math.max(camera.zoom, zoomFloor), duration: 0 })
      } else {
        map.fitBounds(bounds, { padding: 56, maxZoom: 14, duration: 0 })
      }
    }

    return () => {
      previewPopupRef.current?.remove()
      previewPopupRef.current = null
      markerRefs.current.forEach((marker) => marker.remove())
      markerRefs.current = []
      markerButtons.clear()
    }
  }, [focusSelectedMarker, markers])

  useEffect(() => {
    markerButtonsRef.current.forEach((button, id) => {
      const isSelected = selectedIds.includes(id)
      button.classList.toggle('is-selected', isSelected)
      button.setAttribute('aria-pressed', String(isSelected))
    })
  }, [selectedIds])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isReady) return

    searchMarkerRef.current?.remove()
    searchMarkerRef.current = null
    if (!searchMarker) return

    const marker = new Marker({ color: '#e11d48' })
      .setLngLat([searchMarker.longitude, searchMarker.latitude])
      .setPopup(new Popup({ closeButton: false, offset: 32, maxWidth: '18rem' }).setText(searchMarker.label))
      .addTo(map)
    marker.togglePopup()
    searchMarkerRef.current = marker

    if (skipInitialSearchRecentreRef.current) {
      skipInitialSearchRecentreRef.current = false
    } else {
      map.easeTo({ center: [searchMarker.longitude, searchMarker.latitude], zoom: 15, duration: 350 })
    }

    return () => {
      marker.remove()
      if (searchMarkerRef.current === marker) searchMarkerRef.current = null
    }
    // Keyed on the point's own fields, not the object reference, so a
    // caller re-rendering with an equivalent-but-new object literal each
    // time doesn't re-create and re-centre the pin on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, searchMarker?.latitude, searchMarker?.longitude, searchMarker?.label])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isReady) return

    if (!livePosition) {
      livePositionMarkerRef.current?.remove()
      livePositionMarkerRef.current = null
      return
    }

    // Updated in place via setLngLat rather than recreated each fix — a
    // fresh marker per GPS update (every second or two) would flicker.
    if (!livePositionMarkerRef.current) {
      const element = document.createElement('div')
      element.className = 'live-position-marker'
      const dot = document.createElement('div')
      dot.className = 'live-position-marker__dot'
      element.append(dot)
      livePositionMarkerRef.current = new Marker({ element, anchor: 'center' })
        .setLngLat([livePosition.longitude, livePosition.latitude])
        .addTo(map)
    } else {
      livePositionMarkerRef.current.setLngLat([livePosition.longitude, livePosition.latitude])
    }

    const element = livePositionMarkerRef.current.getElement()
    element.classList.toggle('has-heading', livePosition.heading !== undefined)
    if (livePosition.heading !== undefined) {
      element.style.setProperty('--live-heading', `${livePosition.heading}deg`)
    }
  }, [isReady, livePosition])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isReady) return
    map.getCanvas().style.cursor = isSelectingStart ? 'crosshair' : ''
    if (!isSelectingStart || !onSelectStart) return

    const handleMapClick = (event: { lngLat: { lat: number; lng: number } }) => {
      onSelectStart({ latitude: event.lngLat.lat, longitude: event.lngLat.lng })
    }
    map.on('click', handleMapClick)
    return () => {
      map.off('click', handleMapClick)
      map.getCanvas().style.cursor = ''
    }
  }, [isReady, isSelectingStart, onSelectStart])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isReady || !onViewportSettled) return
    const handleDragEnd = () => {
      const center = map.getCenter()
      onViewportSettled({ latitude: center.lat, longitude: center.lng })
    }
    map.on('dragend', handleDragEnd)
    return () => {
      map.off('dragend', handleDragEnd)
    }
  }, [isReady, onViewportSettled])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isReady || !onViewportChange) return
    const handleMoveEnd = () => {
      const center = map.getCenter()
      onViewportChange({ latitude: center.lat, longitude: center.lng, zoom: map.getZoom() })
    }
    map.on('moveend', handleMoveEnd)
    return () => {
      map.off('moveend', handleMoveEnd)
    }
  }, [isReady, onViewportChange])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isReady) return
    const sourceId = 'active-route'
    const outlineId = 'active-route-outline'
    const lineId = 'active-route-line'

    if (map.getLayer(lineId)) map.removeLayer(lineId)
    if (map.getLayer(outlineId)) map.removeLayer(outlineId)
    if (map.getSource(sourceId)) map.removeSource(sourceId)
    routeOriginMarkerRef.current?.remove()
    routeOriginMarkerRef.current = null
    if (!route) return

    map.addSource(sourceId, {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: route.coordinates },
      },
    })
    map.addLayer({ id: outlineId, type: 'line', source: sourceId, paint: { 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': 0.92 } })
    map.addLayer({ id: lineId, type: 'line', source: sourceId, paint: { 'line-color': '#176b87', 'line-width': 5, 'line-opacity': 1 } })

    // The route's own first point is the starting point — the destination
    // already has its own marker (the selected wifi/support place), so this
    // just fills the one missing pin, like Google Maps' start/end markers.
    const originPoint = route.coordinates[0]
    if (originPoint) {
      routeOriginMarkerRef.current = new Marker({ color: '#16a34a' })
        .setLngLat(originPoint)
        .setPopup(new Popup({ closeButton: false, offset: 32, maxWidth: '14rem' }).setText('Starting point'))
        .addTo(map)
    }

    const bounds = new LngLatBounds()
    route.coordinates.forEach((point) => bounds.extend(point))
    map.fitBounds(bounds, { padding: 72, maxZoom: 15, duration: 500 })

    return () => {
      if (map.getLayer(lineId)) map.removeLayer(lineId)
      if (map.getLayer(outlineId)) map.removeLayer(outlineId)
      if (map.getSource(sourceId)) map.removeSource(sourceId)
      routeOriginMarkerRef.current?.remove()
      routeOriginMarkerRef.current = null
    }
  }, [isReady, route])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isReady || !route || routeRecentreKey === 0) return
    const bounds = new LngLatBounds()
    route.coordinates.forEach((point) => bounds.extend(point))
    map.fitBounds(bounds, { padding: 72, maxZoom: 15, duration: 500 })
  }, [isReady, route, routeRecentreKey])

  if (hasFailed) {
    return (
      <div className="map-unavailable" role="alert">
        <strong>The map could not be displayed</strong>
        <p>Use the list view to read all nearby results.</p>
        <button className="button button--quiet" type="button" onClick={retry}>Try again</button>
        <button className="button button--quiet" type="button" onClick={onReturnToList}>Return to list</button>
      </div>
    )
  }

  return (
    <div className={`map-frame${isSelectingStart ? ' is-selecting-start' : ''}`} aria-label={ariaLabel} role="region">
      {!isReady ? <div className="map-loading" role="status">Loading map…</div> : null}
      {isSelectingStart ? <div className="map-pick-instruction" role="status">Select a starting point on the map</div> : null}
      <div className="map-canvas" ref={containerRef} />
    </div>
  )
}
