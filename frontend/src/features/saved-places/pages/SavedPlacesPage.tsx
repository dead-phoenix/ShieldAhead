import { useState } from 'react'
import { Link } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import type { SupportService } from '../../../data/contracts'
import { useSupportAreaCache } from '../../../data/offline/useSupportAreaCache'
import { useOnlineStatus } from '../../../shared/hooks/useOnlineStatus'
import { formatSavedDate } from '../../../shared/utils/formatDate'
import { removeSavedPlace } from '../../../storage/savedPlacesStorage'
import { mapPlaceKindPresentation } from '../../map/model/mapPlacePresentation'
import { SupportCacheStatus } from '../components/SupportCacheStatus'
import { savedPlaceLocality } from '../savedPlaceRecords'
import { useSavedPlaces } from '../useSavedPlaces'
import '../SavedPlaces.css'

function distanceFromMyArea(service: SupportService): string {
  return service.distanceKm === undefined
    ? 'Distance from My area not confirmed'
    : `${service.distanceKm} km from My area`
}

export function SavedPlacesPage() {
  const savedPlaces = useSavedPlaces()
  const cacheState = useSupportAreaCache()
  const isOnline = useOnlineStatus()
  const [removalMessage, setRemovalMessage] = useState('')
  const { area, cache } = cacheState
  const isStatic = cache?.dataSource === 'static'

  function remove(key: string, name: string) {
    setRemovalMessage(removeSavedPlace(key)
      ? `Removed ${name} from saved places`
      : `${name} could not be removed. Check browser storage settings.`)
  }

  return (
    <section className="content-page saved-places-page" aria-labelledby="saved-title">
      <div className="page-heading">
        <div>
          <h1 id="saved-title">Saved places</h1>
          <p>These lists open with no signal. The map and directions need an internet connection.</p>
        </div>
      </div>
      {!isOnline ? <p className="inline-status" role="status">You're offline. Showing what is saved on this device.</p> : null}

      <section aria-labelledby="saved-hearted-title">
        <h2 id="saved-hearted-title">Your saved places</h2>
        {savedPlaces.length === 0 ? (
          <p>Nothing saved yet. Tap the heart on a place to keep it here for offline use.</p>
        ) : (
          <ul className="record-list">
            {savedPlaces.map((place) => (
              <li className="saved-place-row" key={place.key}>
                <Link to={appRoutes.savedPlace(place.key)}>
                  <strong>{place.record.name}</strong>
                  <small>{mapPlaceKindPresentation[place.record.placeType].singularLabel}{savedPlaceLocality(place.record) ? ` · ${savedPlaceLocality(place.record)}` : ''}</small>
                  <small>Saved {formatSavedDate(place.savedAt)}</small>
                </Link>
                <button
                  className="button button--quiet button--compact"
                  type="button"
                  aria-label={`Remove ${place.record.name} from saved places`}
                  onClick={() => remove(place.key, place.record.name)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="save-place-status" role="status" aria-live="polite">{removalMessage}</p>
      </section>

      <section aria-labelledby="saved-support-title">
        <h2 id="saved-support-title">Support services near {cache?.areaLabel ?? area?.label ?? 'My area'}</h2>
        <SupportCacheStatus state={cacheState} action="refresh" />
        {cache && cache.records.length > 0 ? (
          <>
            <ul className="record-list">
              {cache.records.map((service) => (
                <li className="saved-place-row" key={service.id}>
                  <Link to={appRoutes.supportDetail(service.id)} state={{ searchPostcode: cache.postcode }}>
                    <strong>{service.name}</strong>
                    <small>{[service.suburb !== 'Area not confirmed' ? service.suburb : '', service.postcode].filter(Boolean).join(' ') || 'Area not confirmed'}</small>
                    <small>{distanceFromMyArea(service)}</small>
                    {isStatic ? <small>Approximate location</small> : !service.address ? <small>Street address not confirmed</small> : null}
                    <small>Saved {formatSavedDate(cache.savedAt)}</small>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="data-footnote">Distances are from My area ({cache.areaLabel}), not from where you are now.</p>
          </>
        ) : null}
      </section>

      <section aria-labelledby="saved-nearby-title">
        <h2 id="saved-nearby-title">Emergency services</h2>
        <p>Hospitals, police, fire and ambulance stations near My area are on the nearby list.</p>
        <Link className="button button--quiet" to={appRoutes.nearby}>Nearby emergency services</Link>
      </section>
    </section>
  )
}
