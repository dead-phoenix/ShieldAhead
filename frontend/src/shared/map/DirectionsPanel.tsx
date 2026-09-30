import { ArrowClockwise, Car, Crosshair, CursorClick, MapPin, PersonSimpleWalk, Warning } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import {
  getDirections,
  type DirectionsProfile,
  type RoutePoint,
  type RoutePreview,
} from '../../data/api/directionsApi'
import { LocationResolveError, readBrowserPosition } from '../../features/location/resolveSearchLocation'

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
  const [route, setRoute] = useState<RoutePreview | undefined>(initialState?.route)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [originLabel, setOriginLabel] = useState(initialState?.originLabel ?? '')

  useEffect(() => {
    onStateChange?.({ profile, origin, originLabel, route })
  }, [onStateChange, origin, originLabel, profile, route])

  async function calculate(nextProfile: DirectionsProfile, nextOrigin: RoutePoint) {
    if (!isOnline) {
      setError('Route calculation needs an internet connection. Your selected place has been kept.')
      return
    }
    setIsLoading(true)
    setError('')
    try {
      const nextRoute = await getDirections(nextOrigin, destination, nextProfile)
      setRoute(nextRoute)
      onRouteChange(nextRoute)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'A route could not be calculated.')
      setRoute(undefined)
      onRouteChange(undefined)
    } finally {
      setIsLoading(false)
    }
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
              value={origin ? originLabel : ''}
              placeholder="Choose a starting point"
              readOnly
              onClick={onRequestMapStart}
              aria-describedby="directions-start-help"
              disabled={isLoading || !isOnline}
            />
          </div>
        </label>
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
