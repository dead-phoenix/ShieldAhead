import { ArrowRight, Clock, CloudSlash, Heart, MapPin, NavigationArrow, WifiHigh } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { mockWifiRepository } from '../../../data/mock/mockRepositories'
import { useRepositoryData } from '../../../data/useRepositoryData'
import { LoadingState } from '../../../shared/components/LoadingState'
import { EmptyState } from '../../../shared/components/EmptyState'
import { PrototypeBadge } from '../../../shared/components/PrototypeBadge'
import { useOnlineStatus } from '../../../shared/hooks/useOnlineStatus'
import { formatSavedDate } from '../../../shared/utils/formatDate'
import { getHouseholdProfile, getOfflinePreferences, getUsualWifiSpot } from '../../../storage/onboardingDraftStorage'

export function WifiListPage() {
  const { data, isLoading, error, retry } = useRepositoryData(mockWifiRepository.list)
  const isOnline = useOnlineStatus()
  const postcode = getHouseholdProfile()?.postcode ?? '3453'
  const usualSpot = getUsualWifiSpot()
  const offline = getOfflinePreferences()
  const canReadRecords = isOnline || offline.wifiSaved

  return (
    <section className="content-page" aria-labelledby="wifi-title">
      <div className="connectivity-strip"><CloudSlash aria-hidden="true" size={21} /><span><strong>{isOnline ? (offline.wifiSaved ? 'Saved for offline use' : 'Online — not saved for offline use') : 'You are offline'}</strong><small>{canReadRecords ? `Showing ${isOnline ? 'prototype' : 'saved'} information near ${postcode}. Saved copy: ${formatSavedDate(data?.metadata.generatedAt ?? offline.lastUpdatedAt)}.` : 'No Wi-Fi information was selected for offline use.'}</small></span></div>
      <div className="page-heading"><div><h1 id="wifi-title">Nearby free Wi-Fi</h1><p>Check conditions before travelling.</p></div><PrototypeBadge /></div>
      {isLoading ? <LoadingState /> : null}
      {error ? <div className="error-state" role="alert"><p>{error}</p><button className="button button--quiet" type="button" onClick={retry}>Try again</button></div> : null}
      {!canReadRecords ? <EmptyState title="No saved Wi-Fi information available offline" action={<Link className="button button--primary" to={appRoutes.offlineInformation}>Choose offline information</Link>}><p>Connect to the internet to view prototype records, or select Wi-Fi information for offline use.</p></EmptyState> : null}
      {data && canReadRecords ? (
        <div className="record-list">
          {data.records.map((location) => (
            <article className="record-row" key={location.id}>
              <div className="record-row__icon"><WifiHigh aria-hidden="true" size={25} weight="duotone" /></div>
              <div className="record-row__content">
                <div className="record-row__title"><h2>{location.name}</h2>{usualSpot === location.id ? <span className="positive-chip"><Heart aria-hidden="true" size={15} weight="fill" /> Usual spot</span> : null}</div>
                <p><MapPin aria-hidden="true" size={17} /> {location.address}, {location.suburb} VIC {location.postcode} · {location.distanceKm} km</p>
                <p><Clock aria-hidden="true" size={17} /> {location.openingHours}</p>
              </div>
              <div className="record-row__actions">
                <Link className="button button--primary button--compact" to={appRoutes.wifiDetail(location.id)}>View details <ArrowRight aria-hidden="true" size={16} weight="bold" /></Link>
                {isOnline ? <a className="button button--quiet button--compact" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${location.address}, ${location.suburb} VIC ${location.postcode}`)}`} target="_blank" rel="noreferrer"><NavigationArrow aria-hidden="true" size={16} /> Open in maps</a> : <button className="button button--quiet button--compact" type="button" disabled>Open in maps</button>}
              </div>
            </article>
          ))}
        </div>
      ) : null}
      <p className="data-footnote">Map information may be unavailable offline. Details may have changed since the saved update.</p>
    </section>
  )
}
