import { Car, Crosshair, CursorClick, MapPin, PersonSimpleWalk } from '@phosphor-icons/react'
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
}

function formatDistance(metres: number): string {
  return metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(1)} km`
}

function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60))
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} hr ${minutes % 60} min`
}

export function DirectionsPanel({ destination, onRouteChange, destinationIsApproximate = false, selectedMapStart, isSelectingMapStart = false, onRequestMapStart }: DirectionsPanelProps) {
  const [profile, setProfile] = useState<DirectionsProfile>('foot-walking')
  const [origin, setOrigin] = useState<RoutePoint>()
  const [route, setRoute] = useState<RoutePreview>()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [originLabel, setOriginLabel] = useState('')

  async function calculate(nextProfile: DirectionsProfile, nextOrigin: RoutePoint) {
    setIsLoading(true)
    setError('')
    try {
      const nextRoute = await getDirections(nextOrigin, destination, nextProfile)
      setRoute(nextRoute)
      onRouteChange(nextRoute)
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'A route could not be calculated.'
      setError(message === 'routing service unavailable'
        ? 'Route preview is temporarily unavailable. Try again later.'
        : message)
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

  return (
    <section className="directions-panel" aria-labelledby="directions-title">
      <div className="directions-panel__header">
        <div>
          <p className="map-detail-card__eyebrow">Route preview</p>
          <h2 id="directions-title">Plan a route</h2>
        </div>
        <div className="directions-modes" aria-label="Travel mode">
          <button type="button" className={profile === 'foot-walking' ? 'is-active' : ''} aria-pressed={profile === 'foot-walking'} onClick={() => changeProfile('foot-walking')}>
            <PersonSimpleWalk aria-hidden="true" size={21} /> Walking
          </button>
          <button type="button" className={profile === 'driving-car' ? 'is-active' : ''} aria-pressed={profile === 'driving-car'} onClick={() => changeProfile('driving-car')}>
            <Car aria-hidden="true" size={21} /> Driving
          </button>
        </div>
      </div>
      <div className="directions-fields">
        <div className="directions-field">
          <Crosshair aria-hidden="true" size={20} />
          <span><small>Starting point</small><strong>{origin ? originLabel : 'Choose a starting point'}</strong></span>
          <div className="directions-origin-actions">
            <button className="button button--quiet button--compact" type="button" onClick={onRequestMapStart} disabled={isLoading} aria-pressed={isSelectingMapStart}>
              <CursorClick aria-hidden="true" size={17} /> {isSelectingMapStart ? 'Select on map…' : 'Choose on map'}
            </button>
            <button className="button button--quiet button--compact" type="button" onClick={useCurrentLocation} disabled={isLoading}>
              <Crosshair aria-hidden="true" size={17} /> Use my location
            </button>
          </div>
        </div>
        <div className="directions-field">
          <MapPin aria-hidden="true" size={20} weight="fill" />
          <span><small>Destination · select another marker to change</small><strong>{destination.name}</strong></span>
        </div>
      </div>
      {isLoading ? <p className="directions-status" role="status">Calculating route…</p> : null}
      {route && !isLoading ? <p className="directions-summary" role="status"><strong>{formatDuration(route.durationSeconds)}</strong><span>{formatDistance(route.distanceMeters)}</span></p> : null}
      {error ? <p className="directions-error" role="alert">{error}</p> : null}
      <p className="directions-note">Your location is used only to calculate this route and is not saved. This is a standard route preview, not emergency navigation.</p>
      {destinationIsApproximate ? <p className="directions-warning">The destination is a postcode-area point, not a confirmed street location. Check the service address before travelling.</p> : null}
    </section>
  )
}
