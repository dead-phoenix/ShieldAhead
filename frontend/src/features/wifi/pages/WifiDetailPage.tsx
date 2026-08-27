import { Clock, Heart, Info, MapPin, NavigationArrow, ShieldCheck, WifiHigh } from '@phosphor-icons/react'
import { useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { mockWifiRepository } from '../../../data/mock/mockRepositories'
import { useRepositoryData } from '../../../data/useRepositoryData'
import { LoadingState } from '../../../shared/components/LoadingState'
import { EmptyState } from '../../../shared/components/EmptyState'
import { PageBackLink } from '../../../shared/components/PageBackLink'
import { PrototypeBadge } from '../../../shared/components/PrototypeBadge'
import { useOnlineStatus } from '../../../shared/hooks/useOnlineStatus'
import { getOfflinePreferences, getUsualWifiSpot, saveUsualWifiSpot } from '../../../storage/onboardingDraftStorage'

export function WifiDetailPage() {
  const { id } = useParams()
  const { data, isLoading, error, retry } = useRepositoryData(mockWifiRepository.list)
  const [usualSpot, setUsualSpot] = useState(getUsualWifiSpot())
  const isOnline = useOnlineStatus()
  const offline = getOfflinePreferences()
  if (isLoading) return <LoadingState />
  if (error) {
    return <section className="detail-page"><PageBackLink to={appRoutes.wifi}>Back to Wi-Fi list</PageBackLink><div className="error-state" role="alert"><p>{error}</p><button className="button button--quiet" type="button" onClick={retry}>Try again</button></div></section>
  }
  if (!isOnline && !offline.wifiSaved) {
    return <section className="detail-page"><PageBackLink to={appRoutes.wifi}>Back to Wi-Fi list</PageBackLink><EmptyState title="This Wi-Fi record is not saved on this device"><p>Reconnect to view prototype records, or choose Wi-Fi information for offline use.</p></EmptyState></section>
  }
  const location = data?.records.find((record) => record.id === id)
  if (!location) return <Navigate replace to={appRoutes.wifi} />

  function markUsualSpot() {
    saveUsualWifiSpot(location!.id)
    setUsualSpot(location!.id)
  }

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${location.address}, ${location.suburb} VIC ${location.postcode}`)}`
  return (
    <section className="detail-page" aria-labelledby="wifi-detail-title">
      <PageBackLink to={appRoutes.wifi}>Back to Wi-Fi list</PageBackLink>
      <div className="page-heading"><div><h1 id="wifi-detail-title">{location.name}</h1><div className="badge-row"><PrototypeBadge /><span className="positive-chip"><ShieldCheck aria-hidden="true" size={15} /> {offline.wifiSaved ? 'Saved for offline use' : 'Online view only'}</span></div></div></div>
      <div className="notice-card"><Info aria-hidden="true" size={22} /><p>Wi-Fi availability is not confirmed. Check before travelling.</p></div>
      <dl className="detail-list">
        <div><dt><NavigationArrow aria-hidden="true" size={20} /> Distance</dt><dd>{location.distanceKm} km from Harcourt 3453</dd></div>
        <div><dt><MapPin aria-hidden="true" size={20} /> Address</dt><dd>{location.address}, {location.suburb} VIC {location.postcode}</dd></div>
        <div><dt><Clock aria-hidden="true" size={20} /> Opening hours</dt><dd>{location.openingHours}</dd></div>
        <div><dt><WifiHigh aria-hidden="true" size={20} /> Access conditions</dt><dd><ul>{location.accessConditions?.map((condition) => <li key={condition}>{condition}</li>)}</ul></dd></div>
      </dl>
      <div className="detail-actions">
        <button className="button button--quiet" type="button" onClick={markUsualSpot}><Heart aria-hidden="true" size={20} weight={usualSpot === location.id ? 'fill' : 'regular'} />{usualSpot === location.id ? 'Usual spot saved' : 'Mark as usual spot'}</button>
        {isOnline ? <a className="button button--primary" href={mapsUrl} target="_blank" rel="noreferrer"><NavigationArrow aria-hidden="true" size={20} /> Open in maps</a> : <button className="button button--primary" type="button" disabled>Open in maps when online</button>}
      </div>
    </section>
  )
}
