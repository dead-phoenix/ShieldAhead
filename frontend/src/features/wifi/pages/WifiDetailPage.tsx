import { Clock, Info, MapPin, NavigationArrow, ShieldCheck, WifiHigh } from '@phosphor-icons/react'
import { useMemo } from 'react'
import { Navigate, useLocation, useParams } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import type { DatasetMetadata, WifiLocation } from '../../../data/contracts'
import { useRepositoryData } from '../../../data/useRepositoryData'
import { getWifiRepository } from '../../../data/wifiRepository'
import { LoadingState } from '../../../shared/components/LoadingState'
import { PageBackLink } from '../../../shared/components/PageBackLink'
import { StatusBanner } from '../../../shared/components/StatusBanner'
import { useOnlineStatus } from '../../../shared/hooks/useOnlineStatus'
import { formatSavedDate } from '../../../shared/utils/formatDate'
import { getSearchPostcode } from '../../../storage/searchLocationStorage'
import { OfflinePlaceUnavailable } from '../../saved-places/components/OfflinePlaceUnavailable'
import { SavedOnNotice } from '../../saved-places/components/SavedOnNotice'
import { SavePlaceButton } from '../../saved-places/components/SavePlaceButton'
import {
  savedPlaceFromWifiLocation,
  savedPlaceKey,
  wifiLocationFromSavedPlace,
} from '../../saved-places/savedPlaceRecords'
import { useSavedPlaces } from '../../saved-places/useSavedPlaces'
import { wifiAreaLabel, wifiMapsUrl } from '../utils/wifiMapsUrl'
import { WifiVerificationBadge } from '../components/WifiVerificationBadge'

interface WifiLocationViewProps {
  location: WifiLocation
  distanceText: string
  isOnline: boolean
  metadata?: DatasetMetadata
  savedAt?: string
}

function WifiLocationView({ location, distanceText, isOnline, metadata, savedAt }: WifiLocationViewProps) {
  const locationLabel = wifiAreaLabel(location)
  const mapsUrl = wifiMapsUrl(location)
  return (
    <section className="detail-page" aria-labelledby="wifi-detail-title">
      <PageBackLink to={appRoutes.wifi}>Back to Wi-Fi list</PageBackLink>
      <div className="page-heading page-heading--saveable"><div><h1 id="wifi-detail-title">{location.name}</h1><div className="badge-row"><WifiVerificationBadge status={location.verificationStatus} /></div></div><SavePlaceButton place={savedPlaceFromWifiLocation(location)} /></div>
      {savedAt ? <SavedOnNotice savedAt={savedAt} /> : null}
      {metadata?.refreshError ? <StatusBanner title="Couldn’t update — showing your saved copy" tone="warning"><p>{metadata.refreshError} Saved on this device: {formatSavedDate(metadata.cachedAt)}.</p></StatusBanner> : null}
      {metadata?.freshnessStatus === 'stale' && !metadata.refreshError && !savedAt ? <StatusBanner title="This saved Wi-Fi information may be out of date" tone="warning"><p>Saved copy: {formatSavedDate(metadata.cachedAt ?? metadata.generatedAt)}. Check for an update before relying on these details.</p></StatusBanner> : null}
      <div className={`notice-card${location.verificationStatus ? ` notice-card--${location.verificationStatus}` : ''}`}>
        {location.verificationStatus === 'confirmed' ? <ShieldCheck aria-hidden="true" size={22} /> : <Info aria-hidden="true" size={22} />}
        <p>{location.verificationStatus === 'confirmed'
          ? "This is an outdoor VicFreeWiFi street hotspot. Open in maps to see the exact pin. Look for the network named VicFreeWiFi — it is not that building's private Wi-Fi."
          : location.verificationStatus === 'likely'
            ? 'This facility is likely to offer Wi-Fi, but availability is not officially confirmed. Check with staff before travelling.'
            : 'Wi-Fi availability is not confirmed. Check before travelling.'}</p>
      </div>
      <dl className="detail-list">
        <div><dt><NavigationArrow aria-hidden="true" size={20} /> Distance</dt><dd>{distanceText}</dd></div>
        <div><dt><MapPin aria-hidden="true" size={20} /> Address</dt><dd>{location.address ? locationLabel : location.latitude != null && location.longitude != null ? `Street address not confirmed. Exact map point available for ${locationLabel}.` : `Street address not confirmed. Listed for ${locationLabel}.`}</dd></div>
        <div><dt><Clock aria-hidden="true" size={20} /> Opening hours</dt><dd>{location.openingHours ?? 'Opening hours not confirmed'}</dd></div>
        <div><dt><WifiHigh aria-hidden="true" size={20} /> Access conditions</dt><dd>{location.accessConditions?.length ? <ul>{location.accessConditions.map((condition) => <li key={condition}>{condition}</li>)}</ul> : 'Access conditions not confirmed'}</dd></div>
      </dl>
      <div className="detail-actions">
        {isOnline ? (
          <a className="button button--primary" href={mapsUrl} target="_blank" rel="noreferrer"><NavigationArrow aria-hidden="true" size={20} /> Open in maps</a>
        ) : (
          <>
            <button className="button button--primary" type="button" disabled><NavigationArrow aria-hidden="true" size={20} /> Open in maps</button>
            <p className="field-help">Needs an internet connection</p>
          </>
        )}
      </div>
    </section>
  )
}

export function WifiDetailPage() {
  const routeLocation = useLocation()
  const { id } = useParams()
  const navigationPostcode = (routeLocation.state as { searchPostcode?: unknown } | null)?.searchPostcode
  const postcode = typeof navigationPostcode === 'string' ? navigationPostcode : getSearchPostcode()
  const repository = useMemo(
    () => getWifiRepository(postcode),
    [postcode],
  )
  const { data, isLoading, error, retry } = useRepositoryData(repository.list)
  const isOnline = useOnlineStatus()
  const savedPlaces = useSavedPlaces()

  if (isLoading) return <LoadingState />
  const liveLocation = data?.records.find((record) => record.id === id)
  if (liveLocation && data) {
    return (
      <WifiLocationView
        location={liveLocation}
        distanceText={liveLocation.distanceKm === undefined ? 'Distance from your postcode is not confirmed' : `${liveLocation.distanceKm} km from ${postcode}`}
        isOnline={isOnline}
        metadata={data.metadata}
        savedAt={data.metadata.dataOrigin === 'cache' && !data.metadata.refreshError ? data.metadata.cachedAt : undefined}
      />
    )
  }
  const savedPlace = savedPlaces.find((place) => place.key === savedPlaceKey('wifi', id ?? ''))
  if (savedPlace) {
    return <WifiLocationView location={wifiLocationFromSavedPlace(savedPlace)} distanceText="Distance not saved with this place" isOnline={isOnline} savedAt={savedPlace.savedAt} />
  }
  if (!isOnline) {
    return <section className="detail-page"><PageBackLink to={appRoutes.saved}>Back to saved places</PageBackLink><OfflinePlaceUnavailable /></section>
  }
  if (error) {
    return <section className="detail-page"><PageBackLink to={appRoutes.wifi}>Back to Wi-Fi list</PageBackLink><div className="error-state" role="alert"><p>{error}</p><button className="button button--quiet" type="button" onClick={retry}>Try again</button></div></section>
  }
  return <Navigate replace to={appRoutes.wifi} />
}
