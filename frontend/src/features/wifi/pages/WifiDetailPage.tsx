import { Clock, Heart, Info, MapPin, NavigationArrow, ShieldCheck, WifiHigh } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { useRepositoryData } from '../../../data/useRepositoryData'
import { getWifiDataSourceMode, getWifiRepository } from '../../../data/wifiRepository'
import { LoadingState } from '../../../shared/components/LoadingState'
import { EmptyState } from '../../../shared/components/EmptyState'
import { PageBackLink } from '../../../shared/components/PageBackLink'
import { PrototypeBadge } from '../../../shared/components/PrototypeBadge'
import { StatusBanner } from '../../../shared/components/StatusBanner'
import { useOnlineStatus } from '../../../shared/hooks/useOnlineStatus'
import { formatSavedDate } from '../../../shared/utils/formatDate'
import { clearUsualWifiSpot, getHouseholdProfile, getOfflinePreferences, getUsualWifiSpot, saveUsualWifiSpot } from '../../../storage/onboardingDraftStorage'
import { WifiVerificationBadge } from '../components/WifiVerificationBadge'

export function WifiDetailPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const fixture = searchParams.get('fixture')
  const dataSourceMode = getWifiDataSourceMode(fixture)
  const postcode = getHouseholdProfile()?.postcode ?? '3453'
  const repository = useMemo(
    () => getWifiRepository(fixture, postcode),
    [fixture, postcode],
  )
  const { data, isLoading, error, retry } = useRepositoryData(repository.list)
  const [usualSpot, setUsualSpot] = useState(getUsualWifiSpot())
  const [message, setMessage] = useState('')
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

  function toggleUsualSpot() {
    if (usualSpot === location!.id) {
      clearUsualWifiSpot()
      setUsualSpot(null)
      setMessage('Removed as your usual spot. It will now be sorted by distance.')
      return
    }
    saveUsualWifiSpot(location!.id)
    setUsualSpot(location!.id)
    setMessage('Saved as your usual spot. It will appear first in the list.')
  }

  const locationLabel = location.address
    ? `${location.address}, ${location.suburb} VIC ${location.postcode}`
    : `${location.suburb} VIC ${location.postcode}`
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationLabel)}`
  return (
    <section className="detail-page" aria-labelledby="wifi-detail-title">
      <PageBackLink to={appRoutes.wifi}>Back to Wi-Fi list</PageBackLink>
      <div className="page-heading"><div><h1 id="wifi-detail-title">{location.name}</h1><div className="badge-row">{dataSourceMode === 'mock' ? <PrototypeBadge /> : null}<span className="positive-chip"><ShieldCheck aria-hidden="true" size={15} /> {offline.wifiSaved ? 'Saved for offline use' : 'Online view only'}</span><WifiVerificationBadge status={location.verificationStatus} /></div></div></div>
      {data?.metadata.freshnessStatus === 'stale' ? <StatusBanner title="This saved Wi-Fi information may be out of date" tone="warning"><p>Saved copy: {formatSavedDate(data.metadata.generatedAt)}. Check for an update before relying on these details.</p></StatusBanner> : null}
      <div className={`notice-card${location.verificationStatus ? ` notice-card--${location.verificationStatus}` : ''}`}>
        {location.verificationStatus === 'confirmed' ? <ShieldCheck aria-hidden="true" size={22} /> : <Info aria-hidden="true" size={22} />}
        <p>{location.verificationStatus === 'confirmed'
          ? 'This location appears in the official VicFreeWiFi listing. Opening hours and access conditions may still change.'
          : location.verificationStatus === 'likely'
            ? 'This facility is likely to offer Wi-Fi, but availability is not officially confirmed. Check with staff before travelling.'
            : 'Wi-Fi availability is not confirmed. Check before travelling.'}</p>
      </div>
      <dl className="detail-list">
        <div><dt><NavigationArrow aria-hidden="true" size={20} /> Distance</dt><dd>{location.distanceKm === undefined ? 'Distance from your postcode is not confirmed' : `${location.distanceKm} km from ${postcode}`}</dd></div>
        <div><dt><MapPin aria-hidden="true" size={20} /> Address</dt><dd>{location.address ? locationLabel : `Street address not confirmed. Listed for ${locationLabel}.`}</dd></div>
        <div><dt><Clock aria-hidden="true" size={20} /> Opening hours</dt><dd>{location.openingHours ?? 'Opening hours not confirmed'}</dd></div>
        <div><dt><WifiHigh aria-hidden="true" size={20} /> Access conditions</dt><dd>{location.accessConditions?.length ? <ul>{location.accessConditions.map((condition) => <li key={condition}>{condition}</li>)}</ul> : 'Access conditions not confirmed'}</dd></div>
      </dl>
      {message ? <p className="inline-status" role="status" aria-live="polite">{message}</p> : null}
      <div className="detail-actions">
        <button className="button button--quiet" type="button" aria-pressed={usualSpot === location.id} onClick={toggleUsualSpot}><Heart aria-hidden="true" size={20} weight={usualSpot === location.id ? 'fill' : 'regular'} />{usualSpot === location.id ? 'Remove as usual spot' : 'Mark as usual spot'}</button>
        {isOnline ? <a className="button button--primary" href={mapsUrl} target="_blank" rel="noreferrer"><NavigationArrow aria-hidden="true" size={20} /> Open in maps</a> : <button className="button button--primary" type="button" disabled>Open in maps when online</button>}
      </div>
    </section>
  )
}
