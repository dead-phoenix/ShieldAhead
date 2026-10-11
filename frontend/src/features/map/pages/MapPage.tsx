import {
  Ambulance,
  ArrowLeft,
  Crosshair,
  Fire,
  HandHeart,
  Heart,
  Hospital,
  MagnifyingGlass,
  MapPin,
  NavigationArrow,
  Phone,
  ShieldCheckered,
  WifiHigh,
} from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { SavePlaceButton } from '../../saved-places/components/SavePlaceButton'
import { savedPlaceFromMapPlace } from '../../saved-places/savedPlaceRecords'
import { useSavedPlaces } from '../../saved-places/useSavedPlaces'
import { useCurrentPosition, type PositionErrorReason } from '../../nearby/useCurrentPosition'
import { EmptyState } from '../../../shared/components/EmptyState'
import { LoadingState } from '../../../shared/components/LoadingState'
import { StatusBanner } from '../../../shared/components/StatusBanner'
import { useOnlineStatus } from '../../../shared/hooks/useOnlineStatus'
import { LazyMapView } from '../../../shared/map/LazyMapView'
import { ListMapToggle, type ResultsView } from '../../../shared/map/ListMapToggle'
import { MapLegend, type MapLegendItem } from '../../../shared/map/MapLegend'
import { DirectionsPanel, type DirectionsPanelState } from '../../../shared/map/DirectionsPanel'
import {
  getSearchLocation,
  getSearchPostcode,
  saveSearchLocation,
  type SearchLocation,
} from '../../../storage/searchLocationStorage'
import { resolveCoordinates, searchLocations, type SearchLocationResult } from '../data/locationSearchApi'
import type { RoutePoint, RoutePreview, RouteViaKind } from '../../../data/api/directionsApi'
import type { LivePositionPoint, MapViewport, SearchMarkerPoint } from '../../../shared/map/MapView'
import { mapPlaceHasCoordinates, mapPlacesToMapRecords } from '../data/mapPlaceMapRecords'
import { getMapPlaceRepository } from '../data/mapPlaceRepository'
import { MapFilters } from '../components/MapFilters'
import {
  enabledMapPlaceKinds,
  mapPlaceKindPresentation,
} from '../model/mapPlacePresentation'
import type { MapPlace, MapPlaceKind, MapPlaceResult } from '../model/mapTypes'
import {
  readMapSessionState,
  saveMapSessionState,
  type MapPanelMode,
  type MobilePanelSize,
} from '../model/mapSessionStorage'
import './MapPage.css'

function restoredKinds(kinds: MapPlaceKind[] | undefined, category: string | null): MapPlaceKind[] {
  const categoryKind = enabledMapPlaceKinds.find((kind) => kind === category)
  if (categoryKind) return [categoryKind]
  const enabled = kinds?.filter((kind) => enabledMapPlaceKinds.includes(kind)) ?? []
  return enabled.length > 0 ? enabled : [...enabledMapPlaceKinds]
}

function placeAddress(place: MapPlace): string {
  const locality = [place.suburb, place.postcode].filter(Boolean).join(' ')
  return place.address
    ? [place.address, locality].filter(Boolean).join(', ')
    : locality || 'Address not provided'
}

function sortPlaces(places: MapPlace[]): MapPlace[] {
  return [...places].sort((left, right) =>
    (left.distanceKm ?? Number.POSITIVE_INFINITY)
    - (right.distanceKm ?? Number.POSITIVE_INFINITY))
}

const LOCATE_ME_ERRORS: Record<PositionErrorReason, string> = {
  denied: 'Location access is blocked. Enter an address, suburb, or postcode instead.',
  timeout: 'Your location could not be found in time. Try again, or enter a postcode instead.',
  unavailable: 'Your location could not be found. Try again, or enter a postcode instead.',
  unsupported: 'This device cannot share its location. Enter an address, suburb, or postcode instead.',
}

const MAP_RESULT_LIMIT = 30

// Emergency facilities are far sparser than wifi hotspots or charities —
// in a city, reaching the 30th-nearest fire or police station can mean
// pulling one in from the other side of the metro area, which then drags
// the map's auto-fit zoom out so far that the genuinely nearby wifi/
// charity pins shrink to an unreadable dot in the centre. Nobody needs to
// see the 30 nearest fire stations anyway, so these kinds get a much
// smaller cap — keeping the view (and the map's zoom level) focused on
// what's actually close by.
const RESULT_LIMIT_BY_KIND: Partial<Record<MapPlaceKind, number>> = {
  hospital: 8,
  police: 8,
  fire: 8,
  ambulance: 8,
}

// Capping the combined, distance-sorted list at one flat count starves out
// sparser kinds whenever a denser kind fills every slot first. Capping per
// kind instead keeps every selected category represented, then re-sorts
// the surviving places back into one nearest-first list for display.
function limitPerKind(places: MapPlace[], defaultLimit: number): MapPlace[] {
  const takenByKind = new Map<MapPlace['kind'], number>()
  const limited = places.filter((place) => {
    const limit = RESULT_LIMIT_BY_KIND[place.kind] ?? defaultLimit
    const taken = takenByKind.get(place.kind) ?? 0
    if (taken >= limit) return false
    takenByKind.set(place.kind, taken + 1)
    return true
  })
  return sortPlaces(limited)
}

const legendVariantByKind: Record<MapPlaceKind, 'confirmed' | 'support' | 'hospital' | 'police' | 'fire' | 'ambulance'> = {
  wifi: 'confirmed',
  support: 'support',
  hospital: 'hospital',
  police: 'police',
  fire: 'fire',
  ambulance: 'ambulance',
}

function formatDate(value: string | undefined): string {
  if (!value) return 'Not provided'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Not provided'
    : new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium' }).format(date)
}

function latestSavedAt(result: MapPlaceResult | null): string | undefined {
  return result?.datasets
    .map(({ metadata }) => metadata.cachedAt)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0]
}

function PlaceIcon({ kind }: { kind: MapPlaceKind }) {
  if (kind === 'wifi') return <WifiHigh aria-hidden="true" size={23} weight="duotone" />
  if (kind === 'support') return <HandHeart aria-hidden="true" size={23} weight="duotone" />
  if (kind === 'hospital') return <Hospital aria-hidden="true" size={23} weight="duotone" />
  if (kind === 'police') return <ShieldCheckered aria-hidden="true" size={23} weight="duotone" />
  if (kind === 'fire') return <Fire aria-hidden="true" size={23} weight="duotone" />
  return <Ambulance aria-hidden="true" size={23} weight="duotone" />
}

export function MapPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [restoredSession] = useState(readMapSessionState)
  const savedLocation = getSearchLocation()
  const fallbackPostcode = getSearchPostcode()
  const [area, setArea] = useState<SearchLocation>({
    postcode: restoredSession?.area.postcode ?? savedLocation?.postcode ?? fallbackPostcode,
    label: restoredSession?.area.label ?? savedLocation?.label ?? fallbackPostcode,
  })
  const [query, setQuery] = useState(restoredSession?.query ?? savedLocation?.label ?? fallbackPostcode)
  const [selectedKinds, setSelectedKinds] = useState<MapPlaceKind[]>(
    () => restoredKinds(restoredSession?.selectedKinds, searchParams.get('category')),
  )
  const [result, setResult] = useState<MapPlaceResult | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [retryKey, setRetryKey] = useState(0)
  const [searchError, setSearchError] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchLocationResult[]>([])
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | undefined>(restoredSession?.selectedPlaceId)
  const [panelMode, setPanelMode] = useState<MapPanelMode>(restoredSession?.panelMode ?? 'results')
  const [mobileView, setMobileView] = useState<ResultsView>(restoredSession?.mobileView ?? 'map')
  const [panelSize, setPanelSize] = useState<MobilePanelSize>(restoredSession?.panelSize ?? 'half')
  const [movedMapCenter, setMovedMapCenter] = useState<RoutePoint>()
  const [mapViewport, setMapViewport] = useState<MapViewport | undefined>(restoredSession?.viewport)
  const [searchPoint, setSearchPoint] = useState<SearchMarkerPoint | undefined>(restoredSession?.searchPoint)
  const [routePreview, setRoutePreview] = useState<RoutePreview | undefined>(restoredSession?.directions?.route)
  const [directionsState, setDirectionsState] = useState<DirectionsPanelState | undefined>(restoredSession?.directions)
  const [selectedMapStart, setSelectedMapStart] = useState<RoutePoint>()
  const [isSelectingMapStart, setIsSelectingMapStart] = useState(false)
  const [routeRecentreKey, setRouteRecentreKey] = useState(0)
  const [livePosition, setLivePosition] = useState<LivePositionPoint>()
  const listScrollTopRef = useRef(restoredSession?.listScrollTop ?? 0)
  const panelContentRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const appliedQueryRef = useRef(restoredSession?.query ?? savedLocation?.label ?? fallbackPostcode)
  const suggestionRequestRef = useRef(0)
  const panelDragStartRef = useRef<number | undefined>(undefined)
  const panelDragStartHeightRef = useRef<number | undefined>(undefined)
  const [panelDragHeight, setPanelDragHeight] = useState<number | undefined>(undefined)
  const isOnline = useOnlineStatus()
  const savedPlaces = useSavedPlaces()
  const myLocation = useCurrentPosition()

  useEffect(() => {
    saveMapSessionState({
      area,
      query,
      selectedKinds,
      selectedPlaceId,
      panelMode,
      mobileView,
      panelSize,
      listScrollTop: listScrollTopRef.current,
      viewport: mapViewport,
      searchPoint,
      directions: directionsState,
    })
  }, [area, directionsState, mapViewport, mobileView, panelMode, panelSize, query, searchPoint, selectedKinds, selectedPlaceId])

  const repository = useMemo(
    () => getMapPlaceRepository({ postcode: area.postcode }),
    [area.postcode],
  )

  useEffect(() => {
    let isCurrent = true
    repository.findNearby({ postcode: area.postcode })
      .then((nextResult) => {
        if (isCurrent) setResult(nextResult)
      })
      .catch((reason: unknown) => {
        if (isCurrent) {
          setLoadError(reason instanceof Error
            ? reason.message
            : 'Nearby places could not be loaded. Try again.')
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false)
      })
    return () => {
      isCurrent = false
    }
  }, [area.postcode, repository, retryKey])

  const filteredPlaces = useMemo(() => sortPlaces(
    (result?.places ?? []).filter((place) => selectedKinds.includes(place.kind)),
  ), [result?.places, selectedKinds])
  const visiblePlaces = useMemo(
    () => limitPerKind(filteredPlaces, MAP_RESULT_LIMIT),
    [filteredPlaces],
  )
  const mapRecords = useMemo(() => mapPlacesToMapRecords(visiblePlaces), [visiblePlaces])
  const selectedPlace = visiblePlaces.find(({ id }) => id === selectedPlaceId)
  // Only kicks in when the map filter is narrowed to exactly one of these —
  // ambiguous with multiple kinds active (or none), so left off in that case.
  const directionsViaKind: RouteViaKind | undefined = selectedKinds.length === 1 && (selectedKinds[0] === 'hospital' || selectedKinds[0] === 'support')
    ? selectedKinds[0]
    : undefined
  const hasInvalidSelection = Boolean(!isLoading && result && selectedPlaceId && !selectedPlace)
  const displayedPanelMode: MapPanelMode = hasInvalidSelection ? 'results' : panelMode
  const displayedSelectedPlaceId = hasInvalidSelection ? undefined : selectedPlaceId
  const routeMapRecords = useMemo(
    () => displayedPanelMode !== 'results' && displayedSelectedPlaceId
      ? mapRecords.filter((record) => record.id === displayedSelectedPlaceId)
      : mapRecords,
    [displayedPanelMode, displayedSelectedPlaceId, mapRecords],
  )
  const selectedMapIds = useMemo(
    () => displayedSelectedPlaceId ? [displayedSelectedPlaceId] : [],
    [displayedSelectedPlaceId],
  )
  const allSelected = selectedKinds.length === enabledMapPlaceKinds.length
  const legendItems = useMemo(() => {
    const kinds = allSelected ? enabledMapPlaceKinds : selectedKinds
    return kinds.flatMap((kind): MapLegendItem[] => {
      if (kind !== 'wifi') {
        return [{ label: kind === 'support' ? 'Charity' : mapPlaceKindPresentation[kind].label, variant: legendVariantByKind[kind] }]
      }
      // The legend otherwise always called Wi-Fi "confirmed" regardless of
      // what was actually on screen — show each status that's genuinely
      // present among the visible pins, not a fixed assumption.
      const wifiPlaces = visiblePlaces.filter((place) => place.kind === 'wifi')
      const hasConfirmed = wifiPlaces.some((place) => place.verificationStatus === 'confirmed')
      const hasLikely = wifiPlaces.some((place) => place.verificationStatus === 'likely')
      const items: MapLegendItem[] = []
      if (hasConfirmed || !hasLikely) items.push({ label: 'Free Wi-Fi', variant: 'confirmed' })
      if (hasLikely) items.push({ label: 'Free Wi-Fi (likely, not confirmed)', variant: 'likely' })
      return items
    })
  }, [allSelected, selectedKinds, visiblePlaces])

  useEffect(() => {
    if (isLoading || !result || !selectedPlaceId || selectedPlace) return

    // A saved selection can become invalid when its area, filters or result set changes.
    // Return to the usable results state instead of leaving a stale detail panel over the map.
    queueMicrotask(() => {
      setSelectedPlaceId(undefined)
      setPanelMode('results')
      setPanelSize('half')
      setRoutePreview(undefined)
      setDirectionsState(undefined)
      setSelectedMapStart(undefined)
      setIsSelectingMapStart(false)
    })
  }, [isLoading, result, selectedPlace, selectedPlaceId])

  const updateCategoryParam = useCallback((kinds: MapPlaceKind[]) => {
    const next = new URLSearchParams(searchParams)
    if (kinds.length === enabledMapPlaceKinds.length) next.delete('category')
    else next.set('category', kinds.join(','))
    next.set('area', area.postcode)
    setSearchParams(next, { replace: true })
  }, [area.postcode, searchParams, setSearchParams])

  function chooseAll() {
    const next = [...enabledMapPlaceKinds]
    setSelectedKinds(next)
    setSelectedPlaceId(undefined)
    setPanelMode('results')
    updateCategoryParam(next)
  }

  function toggleKind(kind: MapPlaceKind) {
    const next = allSelected
      ? [kind]
      : selectedKinds.includes(kind)
        ? selectedKinds.filter((item) => item !== kind)
        : [...selectedKinds, kind]
    const normalized = next.length === 0 || next.length === enabledMapPlaceKinds.length
      ? [...enabledMapPlaceKinds]
      : next
    setSelectedKinds(normalized)
    setSelectedPlaceId(undefined)
    setPanelMode('results')
    updateCategoryParam(normalized)
  }

  function applyArea(location: SearchLocationResult) {
    const nextArea = { postcode: location.postcode, label: location.label }
    if (!saveSearchLocation(nextArea)) {
      setSearchError('This browser could not save your search area. Check storage settings and try again.')
      return
    }
    setArea(nextArea)
    setIsLoading(true)
    setLoadError('')
    setSearchError('')
    setResult(null)
    // area.postcode may be unchanged (re-selecting the same place) — the
    // fetch effect only re-runs when its dependencies change, so bump
    // retryKey too or isLoading would stay stuck true forever.
    setRetryKey((current) => current + 1)
    setSearchPoint(
      location.latitude != null && location.longitude != null
        ? { latitude: location.latitude, longitude: location.longitude, label: location.label }
        : undefined,
    )
    appliedQueryRef.current = location.label
    suggestionRequestRef.current += 1
    setQuery(location.label)
    setSearchResults([])
    setIsSearching(false)
    setSelectedPlaceId(undefined)
    setPanelMode('results')
    setRoutePreview(undefined)
    setDirectionsState(undefined)
    setSelectedMapStart(undefined)
    setIsSelectingMapStart(false)
    setMapViewport(undefined)
    listScrollTopRef.current = 0
    const next = new URLSearchParams(searchParams)
    next.set('area', location.postcode)
    setSearchParams(next, { replace: true })
  }

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed === appliedQueryRef.current.trim()) {
      suggestionRequestRef.current += 1
      setSearchResults([])
      setIsSearching(false)
      return
    }
    if (trimmed.length < 3 && !/^3\d{3}$/.test(trimmed)) {
      suggestionRequestRef.current += 1
      setSearchResults([])
      setIsSearching(false)
      return
    }
    if (!isOnline && !/^3\d{3}$/.test(trimmed)) {
      suggestionRequestRef.current += 1
      setSearchResults([])
      setIsSearching(false)
      setSearchError('Suburb search needs an internet connection. Enter the postcode of an area you saved earlier, or reconnect and try again.')
      return
    }

    const requestId = ++suggestionRequestRef.current
    const timer = window.setTimeout(() => {
      void (async () => {
        setIsSearching(true)
        setSearchError('')
        try {
          const matches = await searchLocations(trimmed)
          if (requestId !== suggestionRequestRef.current) return
          setSearchResults(matches)
          if (matches.length === 0) {
            setSearchError('No Victorian address matched that search. Check the spelling or enter a postcode.')
          }
        } catch (reason) {
          if (requestId !== suggestionRequestRef.current) return
          setSearchResults([])
          setSearchError(reason instanceof Error
            ? reason.message
            : 'We could not search for that area. Enter a Victorian postcode or try again.')
        } finally {
          if (requestId === suggestionRequestRef.current) setIsSearching(false)
        }
      })()
    }, 300)

    return () => window.clearTimeout(timer)
  }, [isOnline, query])

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    suggestionRequestRef.current += 1
    setSearchError('')
    const trimmed = query.trim()
    if (!trimmed) {
      setSearchResults([])
      setSearchError('Enter a Victorian address, suburb, or postcode.')
      return
    }
    if (!isOnline && !/^3\d{3}$/.test(trimmed)) {
      setSearchResults([])
      setSearchError('Suburb search needs an internet connection. Enter the postcode of an area you saved earlier, or reconnect and try again.')
      return
    }
    setIsSearching(true)
    try {
      const matches = await searchLocations(trimmed)
      if (matches.length === 0) {
        setSearchResults([])
        setSearchError('No Victorian address matched that search. Check the spelling or enter a postcode.')
      } else if (matches.length === 1) {
        applyArea(matches[0])
      } else {
        setSearchResults(matches)
      }
    } catch (reason) {
      setSearchResults([])
      setSearchError(reason instanceof Error
        ? reason.message
        : 'We could not search for that area. Enter a Victorian postcode or try again.')
    } finally {
      setIsSearching(false)
    }
  }

  async function searchMovedMapArea() {
    if (!movedMapCenter) return
    setSearchError('')
    setIsSearching(true)
    try {
      applyArea(await resolveCoordinates(movedMapCenter.latitude, movedMapCenter.longitude))
      setMovedMapCenter(undefined)
    } catch (reason) {
      setSearchError(reason instanceof Error ? reason.message : 'We could not search this map area. Enter a postcode instead.')
    } finally {
      setIsSearching(false)
    }
  }

  function locateMe() {
    setSearchError('')
    myLocation.request((point) => {
      void (async () => {
        setIsSearching(true)
        try {
          applyArea(await resolveCoordinates(point.lat, point.lng))
        } catch (reason) {
          setSearchError(reason instanceof Error ? reason.message : 'We could not use your location. Enter a postcode instead.')
        } finally {
          setIsSearching(false)
        }
      })()
    })
  }

  function selectPlace(id: string) {
    if (panelMode === 'results') {
      listScrollTopRef.current = panelContentRef.current?.scrollTop ?? listScrollTopRef.current
    }
    setSelectedPlaceId(id)
    if (panelMode === 'directions') {
      setRoutePreview(undefined)
      setDirectionsState((current) => current ? { ...current, route: undefined } : current)
      setSelectedMapStart(undefined)
      setIsSelectingMapStart(false)
    } else {
      setPanelMode('details')
    }
    setPanelSize('half')
    setMobileView('map')
  }

  function backToResults() {
    setPanelMode('results')
    setRoutePreview(undefined)
    setDirectionsState(undefined)
    setSelectedMapStart(undefined)
    setIsSelectingMapStart(false)
    window.requestAnimationFrame(() => {
      if (panelContentRef.current) panelContentRef.current.scrollTop = listScrollTopRef.current
    })
  }

  function showDirections() {
    if (!selectedPlace || !mapPlaceHasCoordinates(selectedPlace)) return
    setPanelMode('directions')
    setRoutePreview(directionsState?.route)
    setPanelSize('half')
    setMobileView('map')
  }

  function resizePanel(direction: 'up' | 'down') {
    const sizes: MobilePanelSize[] = ['compact', 'half', 'full']
    const currentIndex = sizes.indexOf(panelSize)
    const nextIndex = direction === 'up'
      ? Math.min(currentIndex + 1, sizes.length - 1)
      : Math.max(currentIndex - 1, 0)
    setPanelSize(sizes[nextIndex])
  }

  function movePanelDrag(clientY: number) {
    const startY = panelDragStartRef.current
    const startHeight = panelDragStartHeightRef.current
    if (startY === undefined || startHeight === undefined) return
    const minimumHeight = 112
    const maximumHeight = Math.max(minimumHeight, window.innerHeight - 132)
    setPanelDragHeight(Math.min(maximumHeight, Math.max(minimumHeight, startHeight + startY - clientY)))
  }

  function finishPanelDrag() {
    const height = panelDragHeight
    panelDragStartRef.current = undefined
    panelDragStartHeightRef.current = undefined
    setPanelDragHeight(undefined)
    if (height === undefined) return
    if (height < window.innerHeight * 0.25) setPanelSize('compact')
    else if (height > window.innerHeight * 0.62) setPanelSize('full')
    else setPanelSize('half')
  }

  const handleDirectionsStateChange = useCallback((state: DirectionsPanelState) => {
    setDirectionsState(state)
  }, [])

  function handleSelectMapStart(point: RoutePoint) {
    setSelectedMapStart(point)
    setIsSelectingMapStart(false)
  }

  function focusAreaSearch() {
    searchInputRef.current?.focus()
    searchInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const panelContent = displayedPanelMode === 'directions' && selectedPlace && mapPlaceHasCoordinates(selectedPlace) ? (
    <section className="unified-map-directions" aria-label="Route planning">
      <button className="unified-map-back" type="button" onClick={() => {
        setPanelMode('details')
        setIsSelectingMapStart(false)
      }}>
        <ArrowLeft aria-hidden="true" size={18} /> Back to place details
      </button>
      <div className="unified-map-directions__heading">
        <h1 id="unified-map-title">Plan a route</h1>
        <p>Compare a standard walking or driving route before you travel.</p>
      </div>
      <DirectionsPanel
        key={selectedPlace.id}
        destination={{ name: selectedPlace.name, latitude: selectedPlace.latitude, longitude: selectedPlace.longitude }}
        destinationId={selectedPlace.id}
        destinationIsApproximate={!selectedPlace.address}
        initialState={directionsState}
        isOnline={isOnline}
        selectedMapStart={selectedMapStart}
        isSelectingMapStart={isSelectingMapStart}
        onRequestMapStart={() => setIsSelectingMapStart((current) => !current)}
        onRouteChange={setRoutePreview}
        onStateChange={handleDirectionsStateChange}
        onLivePositionChange={setLivePosition}
        showHeading={false}
        viaKind={directionsViaKind}
      />
      <p className="unified-map-directions__destination-note">Select another map marker to change the destination. Your current filters and search area will stay in place.</p>
    </section>
  ) : displayedPanelMode === 'details' && selectedPlace ? (
    <article className="unified-map-detail" aria-labelledby="selected-place-title">
      <button className="unified-map-back" type="button" onClick={backToResults}>
        <ArrowLeft aria-hidden="true" size={18} /> Back to results
      </button>
      <div className="unified-map-detail__heading">
        <span className="record-row__icon"><PlaceIcon kind={selectedPlace.kind} /></span>
        <div>
          <h2 id="selected-place-title">{selectedPlace.name}</h2>
          <p>{mapPlaceKindPresentation[selectedPlace.kind].singularLabel}</p>
          <p className="unified-map-detail__summary-address"><MapPin aria-hidden="true" size={15} /> {placeAddress(selectedPlace)}</p>
        </div>
        <SavePlaceButton place={savedPlaceFromMapPlace(selectedPlace)} />
      </div>
      <div className="unified-map-detail__actions">
        {mapPlaceHasCoordinates(selectedPlace) ? (
          <button className="button button--primary" type="button" onClick={showDirections}>
            <NavigationArrow aria-hidden="true" size={18} weight="fill" /> Directions
          </button>
        ) : <p className="directions-warning">Directions are unavailable because this record has no confirmed map coordinates.</p>}
        {selectedPlace.phone ? <a className="button button--quiet" href={`tel:${selectedPlace.phone}`}><Phone aria-hidden="true" size={18} /> Call</a> : null}
      </div>
      <div className="unified-map-detail__expanded">
        <dl className="unified-map-facts">
          <div><dt>Address</dt><dd>{placeAddress(selectedPlace)}</dd></div>
          <div><dt>Distance</dt><dd>{selectedPlace.distanceKm === undefined ? 'Not confirmed' : `${selectedPlace.distanceKm} km`}</dd></div>
          {selectedPlace.phone ? <div><dt>Phone</dt><dd><Phone aria-hidden="true" size={16} /> {selectedPlace.phone}</dd></div> : null}
          {selectedPlace.openingHours ? <div><dt>Opening hours</dt><dd>{selectedPlace.openingHours}</dd></div> : null}
          {selectedPlace.eligibility ? <div><dt>Eligibility</dt><dd>{selectedPlace.eligibility}</dd></div> : null}
          {selectedPlace.accessConditions?.length ? <div><dt>Access conditions</dt><dd>{selectedPlace.accessConditions.join('; ')}</dd></div> : null}
          <div><dt>Updated</dt><dd>{formatDate(selectedPlace.dataUpdatedAt)}</dd></div>
          <div><dt>Information</dt><dd>{selectedPlace.dataOrigin === 'cache' ? 'Saved on this device' : 'Loaded online'}</dd></div>
        </dl>
        {selectedPlace.accessPoints?.length ? (
          <div className="unified-map-detail__access-points">
            <h3>Access points</h3>
            <ul>{selectedPlace.accessPoints.map((point) => <li key={point.name}>{point.name}</li>)}</ul>
          </div>
        ) : null}
        {selectedPlace.serviceTypes?.length ? (
          <section className="unified-map-service-types" aria-labelledby="service-types-title">
            <h3 id="service-types-title">Published information may indicate</h3>
            <div className="service-tags">{selectedPlace.serviceTypes.map((type) => <span key={type}>{type}</span>)}</div>
            <p>Service types are inferred from published charity information and may be incomplete. Check with the organisation before travelling.</p>
          </section>
        ) : null}
      </div>
    </article>
  ) : displayedPanelMode !== 'results' && selectedPlaceId && !isLoading ? (
    <EmptyState title="This place is no longer in these results" action={<button className="button button--quiet" type="button" onClick={backToResults}>Back to results</button>}>
      <p>The saved selection may belong to an older dataset or another search area. The rest of your Map state has been kept.</p>
    </EmptyState>
  ) : (
    <section className="unified-map-results" aria-labelledby="map-results-title">
      <div className="unified-map-results__heading">
        <div>
          <h2 id="map-results-title">Places near {area.label}</h2>
          <p role="status">Showing {visiblePlaces.length} of {filteredPlaces.length} matching places.</p>
        </div>
        <div className="unified-map-mobile-toggle">
          <ListMapToggle value={mobileView} mapDisabled={!isOnline} onChange={setMobileView} />
        </div>
      </div>
      {result?.sourceErrors.map((sourceError) => (
        <StatusBanner key={sourceError.source} title={`${mapPlaceKindPresentation[sourceError.source].label} could not be updated`} tone="warning">
          <p>{sourceError.message} Other available results are still shown.</p>
        </StatusBanner>
      ))}
      {result && result.dataOrigin !== 'network' ? (
        <StatusBanner title={result.dataOrigin === 'cache' ? 'Showing saved information' : 'Some information is saved'} tone="warning">
          <p>This information was saved on this device for {area.label}{latestSavedAt(result) ? ` on ${formatDate(latestSavedAt(result))}` : ''}. Check the update dates before travelling.</p>
        </StatusBanner>
      ) : null}
      {isLoading ? <LoadingState /> : null}
      {loadError ? (
        <div className="error-state" role="alert">
          <p>{loadError}</p>
          <button className="button button--quiet" type="button" onClick={() => {
            setIsLoading(true)
            setLoadError('')
            setRetryKey((current) => current + 1)
          }}>Try again</button>
        </div>
      ) : null}
      {!isLoading && !loadError && filteredPlaces.length === 0 ? (
        <EmptyState
          title={allSelected ? 'No nearby places found' : 'No places match these filters'}
          action={allSelected
            ? <button className="button button--quiet" type="button" onClick={focusAreaSearch}>Search another area</button>
            : <button className="button button--quiet" type="button" onClick={chooseAll}>Clear filters</button>}
        >
          <p>This does not confirm that help is unavailable. {allSelected ? 'Search another suburb or postcode.' : 'Clear the filters or search another area.'}</p>
        </EmptyState>
      ) : null}
      {visiblePlaces.length > 0 ? (
        <div className="unified-map-place-list">
          {visiblePlaces.map((place) => (
            <button
              className={place.id === selectedPlaceId ? 'unified-map-place is-selected' : 'unified-map-place'}
              key={place.id}
              type="button"
              onClick={() => selectPlace(place.id)}
            >
              <span className="record-row__icon"><PlaceIcon kind={place.kind} /></span>
              <span>
                <strong>{place.name}</strong>
                <small className={place.kind === 'wifi' && place.verificationStatus === 'likely' ? 'unified-map-place__unconfirmed' : undefined}>
                  {place.kind === 'wifi' && place.verificationStatus === 'likely'
                    ? 'Free Wi-Fi location — likely, not confirmed'
                    : mapPlaceKindPresentation[place.kind].singularLabel}
                </small>
                <small><MapPin aria-hidden="true" size={15} /> {placeAddress(place)}{place.distanceKm === undefined ? '' : ` · ${place.distanceKm} km`}</small>
                {place.accessPoints ? <small>{place.accessPoints.length} access points</small> : null}
                {!mapPlaceHasCoordinates(place) ? <small className="unified-map-place__map-note">Not shown on map — coordinates not provided</small> : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  )

  return (
    <section className="unified-map-page" aria-labelledby="unified-map-title">
      <div className={`unified-map-workspace unified-map-workspace--${mobileView} unified-map-workspace--${displayedPanelMode}`}>
        <aside
          className={`unified-map-panel unified-map-panel--${panelSize}${panelDragHeight === undefined ? '' : ' is-dragging'}${displayedPanelMode === 'directions' ? ' unified-map-panel--directions' : ''}`}
          aria-label={displayedPanelMode === 'directions' ? 'Route planning' : 'Nearby place information'}
          style={panelDragHeight === undefined ? undefined : { '--mobile-panel-height': `${panelDragHeight}px` } as CSSProperties}
        >
          {displayedPanelMode === 'results' ? <div className="unified-map-controls">
            <div className="unified-map-intro">
              <h1 id="unified-map-title">Support</h1>
              <p>Find public Wi-Fi and community support near your chosen area.</p>
            </div>
            <Link className="button button--quiet unified-map-saved-link" to={appRoutes.saved}>
              <Heart aria-hidden="true" size={18} weight={savedPlaces.length > 0 ? 'fill' : 'regular'} />
              My list{savedPlaces.length > 0 ? ` (${savedPlaces.length})` : ''}
            </Link>
            <form className="unified-map-search" onSubmit={(event) => void handleSearch(event)}>
              <label htmlFor="map-area-search">Search area</label>
              <div>
                <MagnifyingGlass aria-hidden="true" size={20} />
                <input
                  id="map-area-search"
                  ref={searchInputRef}
                  role="combobox"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      suggestionRequestRef.current += 1
                      setSearchResults([])
                    }
                  }}
                  placeholder="Address, suburb, or postcode"
                  autoComplete="off"
                  aria-autocomplete="list"
                  aria-controls="map-area-suggestions"
                  aria-expanded={searchResults.length > 0}
                  aria-invalid={Boolean(searchError)}
                />
                <button
                  aria-label={myLocation.state.status === 'locating' ? 'Finding your location…' : 'Use my current location'}
                  className="button button--quiet unified-map-locate"
                  disabled={myLocation.state.status === 'locating' || isSearching}
                  onClick={locateMe}
                  title="Use my current location"
                  type="button"
                >
                  <Crosshair aria-hidden="true" size={18} />
                </button>
                <button className="button button--primary" type="submit" disabled={isSearching}>
                  {isSearching ? 'Searching…' : 'Search'}
                </button>
              </div>
              {searchError ? (
                <p className="field-error" role="alert">{searchError}</p>
              ) : myLocation.state.status === 'error' ? (
                <p className="field-error" role="alert">{LOCATE_ME_ERRORS[myLocation.state.reason]}</p>
              ) : null}
              {searchResults.length > 0 ? (
                <div className="unified-map-suggestions" id="map-area-suggestions" role="listbox" aria-label="Matching places">
                  {searchResults.map((location) => (
                    <button key={`${location.postcode}-${location.label}`} type="button" role="option" onClick={() => applyArea(location)}>
                      <MapPin aria-hidden="true" size={18} />
                      <span><strong>{location.label}</strong><small>Victoria {location.postcode}</small></span>
                    </button>
                  ))}
                </div>
              ) : null}
            </form>
            <MapFilters selectedKinds={selectedKinds} onChooseAll={chooseAll} onToggleKind={toggleKind} />
          </div> : null}
          <div
            className="unified-map-panel__size"
            role="separator"
            tabIndex={0}
            aria-label="Resize information panel"
            aria-orientation="horizontal"
            aria-valuemin={0}
            aria-valuemax={2}
            aria-valuenow={panelSize === 'compact' ? 0 : panelSize === 'half' ? 1 : 2}
            onKeyDown={(event) => {
              if (event.key === 'ArrowUp') { event.preventDefault(); resizePanel('up') }
              if (event.key === 'ArrowDown') { event.preventDefault(); resizePanel('down') }
            }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId)
              panelDragStartRef.current = event.clientY
              panelDragStartHeightRef.current = panelContentRef.current?.getBoundingClientRect().height
            }}
            onPointerMove={(event) => movePanelDrag(event.clientY)}
            onPointerUp={(event) => { event.currentTarget.releasePointerCapture(event.pointerId); finishPanelDrag() }}
            onPointerCancel={finishPanelDrag}
          >
            <span className="unified-map-panel__handle" aria-hidden="true" />
          </div>
          <div
            className="unified-map-panel__content"
            ref={panelContentRef}
            onScroll={(event) => { listScrollTopRef.current = event.currentTarget.scrollTop }}
          >{panelContent}</div>
        </aside>

        <div className="unified-map-canvas" aria-label="Map area">
          {isOnline ? (
            <>
              <LazyMapView
                ariaLabel={`Map of places near ${area.label}`}
                markers={routeMapRecords}
                selectedIds={selectedMapIds}
                onSelect={(ids) => ids[0] && selectPlace(ids[0])}
                onReturnToList={() => setMobileView('list')}
                onViewportSettled={setMovedMapCenter}
                initialViewport={restoredSession?.viewport}
                onViewportChange={setMapViewport}
                route={routePreview}
                routeRecentreKey={routeRecentreKey}
                focusSelectedMarker={displayedPanelMode === 'details'}
                isSelectingStart={isSelectingMapStart}
                onSelectStart={handleSelectMapStart}
                searchMarker={searchPoint}
                livePosition={livePosition}
              />
              {movedMapCenter && displayedPanelMode !== 'directions' ? (
                <button className="button button--quiet unified-map-search-area" type="button" onClick={() => void searchMovedMapArea()} disabled={isSearching}>
                  Search this area
                </button>
              ) : null}
              {displayedPanelMode !== 'directions' ? <MapLegend items={legendItems} /> : null}
              {displayedPanelMode === 'directions' && routePreview ? (
                <button className="button button--quiet unified-map-recentre" type="button" onClick={() => setRouteRecentreKey((current) => current + 1)}>
                  <Crosshair aria-hidden="true" size={18} /> Re-centre route
                </button>
              ) : null}
            </>
          ) : (
            <div className="map-unavailable" role="status">
              <strong>The map needs an internet connection</strong>
              <p>See your saved places and nearby support services.</p>
              <Link className="button button--quiet" to={appRoutes.saved}>See saved places</Link>
              <button className="button button--quiet" type="button" onClick={() => setMobileView('list')}>Show the list</button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
