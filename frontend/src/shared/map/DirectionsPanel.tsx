import { ArrowClockwise, Car, Crosshair, CursorClick, MapPin, PersonSimpleBike, PersonSimpleWalk, Warning } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import {
  getDirections,
  type DirectionsProfile,
  type RouteOption,
  type RoutePoint,
  type RoutePreview,
} from '../../data/api/directionsApi'
import { LocationResolveError, readBrowserPosition } from '../../features/location/resolveSearchLocation'
import { searchLocations, type SearchLocationResult } from '../../features/map/data/locationSearchApi'

interface DirectionsPanelProps {
  destination: RoutePoint & { name: string }
  onRouteChange: (route?: RoutePreview) => void
  destinationIsApproximate?: boolean
  selectedMapStart?: RoutePoint
  isSelectingMapStart?: boolean
  onRequestMapStart: () => void
  isOnline?: boolean
  initialState?: DirectionsPanelState
  onStateChange?: (state: DirectionsPanelState) => void
  onRecentreRoute?: () => void
  showHeading?: boolean
}

export interface DirectionsPanelState {
  profile: DirectionsProfile
  origin?: RoutePoint
  originLabel: string
  route?: RoutePreview
}

function formatDistance(metres: number): string {
  return metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(1)} km`
}

function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60))
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} hr ${minutes % 60} min`
}

const FALLBACK_DISCLAIMER = (
  'This is a standard route calculation, not a verified emergency evacuation route. '
  + 'Always follow official CFA/VicSES guidance during an active emergency.'
)

export function DirectionsPanel({ destination, onRouteChange, destinationIsApproximate = false, selectedMapStart, isSelectingMapStart = false, onRequestMapStart, isOnline = true, initialState, onStateChange, onRecentreRoute, showHeading = true }: DirectionsPanelProps) {
  const [profile, setProfile] = useState<DirectionsProfile>(initialState?.profile ?? 'foot-walking')
  const [origin, setOrigin] = useState<RoutePoint | undefined>(initialState?.origin)
  const [routeOptions, setRouteOptions] = useState<RouteOption[]>(
    initialState?.route ? [initialState.route] : [],
  )
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0)
  const [disclaimer, setDisclaimer] = useState(initialState?.route?.disclaimer ?? '')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [originLabel, setOriginLabel] = useState(initialState?.originLabel ?? '')
  const [originSuggestions, setOriginSuggestions] = useState<SearchLocationResult[]>([])
  const [isSearchingOrigin, setIsSearchingOrigin] = useState(false)
  const appliedOriginLabelRef = useRef(initialState?.originLabel ?? '')
  const originRequestRef = useRef(0)

  const route: RoutePreview | undefined = routeOptions[selectedRouteIndex]
    ? { ...routeOptions[selectedRouteIndex], disclaimer }
    : undefined

  useEffect(() => {
    onStateChange?.({ profile, origin, originLabel, route })
    // route is derived fresh every render from routeOptions/selectedRouteIndex/disclaimer;
    // depending on those directly avoids re-running this effect on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onStateChange, origin, originLabel, profile, routeOptions, selectedRouteIndex, disclaimer])

  useEffect(() => {
    const trimmed = originLabel.trim()
    if (trimmed === appliedOriginLabelRef.current.trim()) {
      originRequestRef.current += 1
      setOriginSuggestions([])
      setIsSearchingOrigin(false)
      return
    }
    if (trimmed.length < 3 && !/^3\d{3}$/.test(trimmed)) {
      originRequestRef.current += 1
      setOriginSuggestions([])
      setIsSearchingOrigin(false)
      return
    }
    if (!isOnline) {
      originRequestRef.current += 1
      setOriginSuggestions([])
      setIsSearchingOrigin(false)
      return
    }

    const requestId = ++originRequestRef.current
    const timer = window.setTimeout(() => {
      void (async () => {
        setIsSearchingOrigin(true)
        try {
          const matches = await searchLocations(trimmed)
          if (requestId !== originRequestRef.current) return
          // A route needs a precise point, not just a postcode area.
          setOriginSuggestions(matches.filter((match) => match.latitude != null && match.longitude != null))
        } catch {
          if (requestId !== originRequestRef.current) return
          setOriginSuggestions([])
        } finally {
          if (requestId === originRequestRef.current) setIsSearchingOrigin(false)
        }
      })()
    }, 300)

    return () => window.clearTimeout(timer)
  }, [isOnline, originLabel])

  function selectOriginSuggestion(location: SearchLocationResult) {
    if (location.latitude == null || location.longitude == null) return
    originRequestRef.current += 1
    setOriginSuggestions([])
    appliedOriginLabelRef.current = location.label
    setOriginLabel(location.label)
    const nextOrigin = { latitude: location.latitude, longitude: location.longitude }
    setOrigin(nextOrigin)
    void calculate(profile, nextOrigin)
  }

  async function calculate(nextProfile: DirectionsProfile, nextOrigin: RoutePoint) {
    if (!isOnline) {
      setError('Route calculation needs an internet connection. Your selected place has been kept.')
      return
    }
    setIsLoading(true)
    setError('')
    try {
      const alternatives = await getDirections(nextOrigin, destination, nextProfile)
      setRouteOptions(alternatives.routes)
      setSelectedRouteIndex(0)
      setDisclaimer(alternatives.disclaimer)
      onRouteChange(alternatives.routes[0] ? { ...alternatives.routes[0], disclaimer: alternatives.disclaimer } : undefined)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'A route could not be calculated.')
      setRouteOptions([])
      setSelectedRouteIndex(0)
      setDisclaimer('')
      onRouteChange(undefined)
    } finally {
      setIsLoading(false)
    }
  }

  function selectRouteOption(index: number) {
    if (index === selectedRouteIndex || !routeOptions[index]) return
    setSelectedRouteIndex(index)
    onRouteChange({ ...routeOptions[index], disclaimer })
  }

  async function useCurrentLocation() {
    setIsLoading(true)
    setError('')
    try {
      const position = await readBrowserPosition()
      const nextOrigin = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }
      setOrigin(nextOrigin)
      originRequestRef.current += 1
      setOriginSuggestions([])
      appliedOriginLabelRef.current = 'Your current location'
      setOriginLabel('Your current location')
      await calculate(profile, nextOrigin)
    } catch (reason) {
      setIsLoading(false)
      setError(reason instanceof LocationResolveError || reason instanceof Error
        ? reason.message
        : 'We could not read your current location.')
    }
  }

  useEffect(() => {
    if (!selectedMapStart) return
    queueMicrotask(() => {
      setOrigin(selectedMapStart)
      originRequestRef.current += 1
      setOriginSuggestions([])
      appliedOriginLabelRef.current = 'Point selected on map'
      setOriginLabel('Point selected on map')
      void calculate(profile, selectedMapStart)
    })
    // A new selected point is the trigger; profile changes are handled by changeProfile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMapStart])

  function changeProfile(nextProfile: DirectionsProfile) {
    setProfile(nextProfile)
    if (origin) void calculate(nextProfile, origin)
  }

  useEffect(() => {
    if (!initialState?.origin || initialState.route || !isOnline) return
    queueMicrotask(() => void calculate(initialState.profile, initialState.origin as RoutePoint))
    // This is a mount-time recovery for a session that kept an origin but not a route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function retryRoute() {
    if (origin) void calculate(profile, origin)
  }

  return (
    <section className="directions-panel" aria-labelledby={showHeading ? 'directions-title' : undefined} aria-label={showHeading ? undefined : 'Route options'}>
      <div className="directions-panel__header">
        {showHeading ? <h2 id="directions-title">Plan a route</h2> : null}
        <div className="directions-modes" aria-label="Travel mode">
          <button type="button" className={profile === 'foot-walking' ? 'is-active' : ''} aria-pressed={profile === 'foot-walking'} onClick={() => changeProfile('foot-walking')}>
            <PersonSimpleWalk aria-hidden="true" size={21} /> Walking
          </button>
          <button type="button" className={profile === 'driving-car' ? 'is-active' : ''} aria-pressed={profile === 'driving-car'} onClick={() => changeProfile('driving-car')}>
            <Car aria-hidden="true" size={21} /> Driving
          </button>
          <button type="button" className={profile === 'cycling-regular' ? 'is-active' : ''} aria-pressed={profile === 'cycling-regular'} onClick={() => changeProfile('cycling-regular')}>
            <PersonSimpleBike aria-hidden="true" size={21} /> Cycling
          </button>
        </div>
      </div>
      {!isOnline ? (
        <p className="directions-warning" role="status">You are offline. You can review the destination, but calculating or updating a route requires an internet connection.</p>
      ) : null}
      <div className="directions-search-fields">
        <label className="directions-search-field" htmlFor="directions-start">
          <span>Starting point</span>
          <div>
            <Crosshair aria-hidden="true" size={20} />
            <input
              id="directions-start"
              value={originLabel}
              onChange={(event) => setOriginLabel(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  originRequestRef.current += 1
                  setOriginSuggestions([])
                }
              }}
              placeholder="Address, suburb, or postcode"
              autoComplete="off"
              role="combobox"
              aria-autocomplete="list"
              aria-controls="directions-start-suggestions"
              aria-expanded={originSuggestions.length > 0}
              aria-describedby="directions-start-help"
              disabled={isLoading || !isOnline}
            />
          </div>
        </label>
        {originSuggestions.length > 0 ? (
          <div className="directions-suggestions" id="directions-start-suggestions" role="listbox" aria-label="Matching starting points">
            {originSuggestions.map((location) => (
              <button key={`${location.postcode}-${location.label}`} type="button" role="option" onClick={() => selectOriginSuggestion(location)}>
                <MapPin aria-hidden="true" size={18} />
                <span><strong>{location.label}</strong><small>Victoria {location.postcode}</small></span>
              </button>
            ))}
          </div>
        ) : isSearchingOrigin ? (
          <p className="directions-search-status" role="status">Searching…</p>
        ) : null}
        <label className="directions-search-field" htmlFor="directions-destination">
          <span>Destination</span>
          <div>
            <MapPin aria-hidden="true" size={20} weight="fill" />
            <input id="directions-destination" value={destination.name} readOnly />
          </div>
        </label>
      </div>
      <div className="directions-origin-actions" id="directions-start-help">
        <button className="button button--quiet button--compact" type="button" onClick={onRequestMapStart} disabled={isLoading || !isOnline} aria-pressed={isSelectingMapStart}>
          <CursorClick aria-hidden="true" size={17} /> {isSelectingMapStart ? 'Select on map…' : 'Choose on map'}
        </button>
        <button className="button button--quiet button--compact" type="button" onClick={useCurrentLocation} disabled={isLoading || !isOnline}>
          <Crosshair aria-hidden="true" size={17} /> Use my location
        </button>
      </div>
      {isLoading ? <p className="directions-status" role="status">Calculating route…</p> : null}
      {route && !isLoading ? (
        <>
          <p className="directions-summary" role="status">
            <strong>{formatDuration(route.durationSeconds)}</strong>
            <span>{formatDistance(route.distanceMeters)}</span>
          </p>
          {routeOptions.length > 1 ? (
            <div className="directions-route-options" role="listbox" aria-label="Route options">
              {routeOptions.map((option, index) => (
                <button
                  key={index}
                  type="button"
                  role="option"
                  aria-selected={index === selectedRouteIndex}
                  className={index === selectedRouteIndex ? 'is-active' : ''}
                  onClick={() => selectRouteOption(index)}
                >
                  <span>Route {index + 1}{index === 0 ? ' · Recommended' : ''}</span>
                  <strong>{formatDuration(option.durationSeconds)}</strong>
                  <small>{formatDistance(option.distanceMeters)}</small>
                </button>
              ))}
            </div>
          ) : null}
          <p className="directions-disclaimer" role="note">
            <Warning aria-hidden="true" size={22} weight="fill" />
            <span>{route.disclaimer || FALLBACK_DISCLAIMER}</span>
          </p>
          {onRecentreRoute ? (
            <button className="button button--quiet" type="button" onClick={onRecentreRoute}>
              <Crosshair aria-hidden="true" size={18} /> Re-centre route
            </button>
          ) : null}
        </>
      ) : null}
      {error ? (
        <div className="directions-error" role="alert">
          <p>{error}</p>
          {origin && isOnline ? <button className="button button--quiet button--compact" type="button" onClick={retryRoute}><ArrowClockwise aria-hidden="true" size={17} /> Try again</button> : null}
        </div>
      ) : null}
      <p className="directions-note">Your location is used only to calculate this route and is not saved.</p>
      {destinationIsApproximate ? <p className="directions-warning">The destination is a postcode-area point, not a confirmed street location. Check the service address before travelling.</p> : null}
    </section>
  )
}
