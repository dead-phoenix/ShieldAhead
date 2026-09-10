import { ArrowRight, Clock, CloudSlash, Heart, MapPin, NavigationArrow, WifiHigh } from '@phosphor-icons/react'
import { useEffect, useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { useRepositoryData } from '../../../data/useRepositoryData'
import { getWifiRepository } from '../../../data/wifiRepository'
import { LoadingState } from '../../../shared/components/LoadingState'
import { EmptyState } from '../../../shared/components/EmptyState'
import { StatusBanner } from '../../../shared/components/StatusBanner'
import { useOnlineStatus } from '../../../shared/hooks/useOnlineStatus'
import { formatSavedDate } from '../../../shared/utils/formatDate'
import { getSearchLocation, getSearchPostcode } from '../../../storage/searchLocationStorage'
import { clearUsualWifiSpot, getOfflinePreferences, getUsualWifiSpot } from '../../../storage/onboardingDraftStorage'
import { selectWifiLocationsForList } from '../utils/sortWifiLocations'
import { wifiAreaLabel, wifiMapsUrl } from '../utils/wifiMapsUrl'
import { WifiVerificationBadge } from '../components/WifiVerificationBadge'

export function WifiListPage() {
  const routeLocation = useLocation()
  const navigationPostcode = (routeLocation.state as { searchPostcode?: unknown } | null)?.searchPostcode
  const postcode = typeof navigationPostcode === 'string' ? navigationPostcode : getSearchPostcode()
  const searchLabel = getSearchLocation()?.label ?? postcode
  const repository = useMemo(
    () => getWifiRepository(postcode),
    [postcode],
  )
  const { data, isLoading, error, retry } = useRepositoryData(repository.list)
  const isOnline = useOnlineStatus()
  const usualSpot = getUsualWifiSpot()
  const offline = getOfflinePreferences()
  const canReadRecords = Boolean(data)
  const isSavedCopy = data?.metadata.dataOrigin === 'cache'
  const noOfflineCopy = !isOnline && !isLoading && !data
  const removedUsualSpot = Boolean(
    usualSpot && data?.metadata.removedRecordIds?.includes(usualSpot),
  )
  const activeUsualSpot = removedUsualSpot ? null : usualSpot
  const locations = useMemo(
    () => selectWifiLocationsForList(data?.records ?? [], activeUsualSpot),
    [activeUsualSpot, data?.records],
  )

  useEffect(() => {
    if (removedUsualSpot) clearUsualWifiSpot()
  }, [removedUsualSpot])

  function locationLabel(location: (typeof locations)[number]) {
    return wifiAreaLabel(location)
  }

  return (
    <section className="content-page" aria-labelledby="wifi-title">
      <div className="connectivity-strip"><CloudSlash aria-hidden="true" size={21} /><span><strong>{isOnline ? (data?.metadata.cachedAt ? 'Saved for offline use' : offline.wifiSaved ? 'Preparing offline copy' : 'Online — not saved for offline use') : isSavedCopy ? 'You are offline — showing saved copy' : 'You are offline'}</strong><small>{canReadRecords ? `Showing ${isSavedCopy ? 'saved' : 'current'} information near ${postcode}. ${data?.metadata.cachedAt ? `Saved on this device: ${formatSavedDate(data.metadata.cachedAt)}.` : ''}` : noOfflineCopy ? 'No Wi-Fi information is saved for this postcode.' : 'Loading Wi-Fi information…'}</small></span></div>
      <div className="page-heading">
        <div>
          <h1 id="wifi-title">Nearby free Wi-Fi</h1>
          <p>Nearest available results around {searchLabel}. Check conditions before travelling.</p>
        </div>
        <Link className="button location-change" to={`${appRoutes.location}?next=${encodeURIComponent(appRoutes.wifi)}`}>
          <MapPin aria-hidden="true" size={18} weight="fill" />
          <span>Change location</span>
        </Link>
      </div>
      {isLoading ? <LoadingState /> : null}
      {error && !noOfflineCopy ? <div className="error-state" role="alert"><p>{error}</p><button className="button button--quiet" type="button" onClick={retry}>Try again</button></div> : null}
      {noOfflineCopy ? <EmptyState title="No saved Wi-Fi information available offline" action={<Link className="button button--primary" to={appRoutes.offlineInformation}>Choose offline information</Link>}><p>Connect to the internet and download Wi-Fi information before the next disruption.</p></EmptyState> : null}
      {data?.metadata.refreshError ? <StatusBanner title="Couldn’t update — showing your saved copy" tone="warning"><p>{data.metadata.refreshError} Saved on this device: {formatSavedDate(data.metadata.cachedAt)}.</p></StatusBanner> : null}
      {removedUsualSpot ? <StatusBanner title="Your usual spot is no longer listed" tone="warning"><p>The saved location was removed during a data refresh, so ShieldAhead cleared the old pin. Choose another place from the list when one is available.</p></StatusBanner> : null}
      {data?.metadata.freshnessStatus === 'stale' && canReadRecords && !data.metadata.refreshError ? <StatusBanner title="This saved Wi-Fi information may be out of date" tone="warning"><p>Saved copy: {formatSavedDate(data.metadata.cachedAt ?? data.metadata.generatedAt)}. Reconnect and <Link to={appRoutes.offlineInformation}>update saved information</Link> before travelling, if you can.</p></StatusBanner> : null}
      {data && canReadRecords && locations.length === 0 ? <EmptyState title="No verified Wi-Fi coverage for this area" action={<Link className="button button--quiet" to={appRoutes.offlineInformation}>Check saved information</Link>}><p>No verified public Wi-Fi locations are currently listed near {postcode}.</p><p>A local library is a general place to ask about internet access, but Wi-Fi availability and opening hours are not confirmed.</p></EmptyState> : null}
      {data && canReadRecords && locations.length > 0 ? (
        <div className="record-list">
          {locations.map((location) => (
            <article className="record-row" key={location.id}>
              <div className="record-row__icon"><WifiHigh aria-hidden="true" size={25} weight="duotone" /></div>
              <div className="record-row__content">
                <div className="record-row__title"><h2>{location.name}</h2>{activeUsualSpot === location.id ? <span className="positive-chip"><Heart aria-hidden="true" size={15} weight="fill" /> Usual spot</span> : null}</div>
                <WifiVerificationBadge status={location.verificationStatus} />
                <p><MapPin aria-hidden="true" size={17} /> {locationLabel(location)} · {location.distanceKm === undefined ? 'Distance not confirmed' : `${location.distanceKm} km`}</p>
                <p><Clock aria-hidden="true" size={17} /> {location.openingHours ?? 'Opening hours not confirmed'}</p>
              </div>
              <div className="record-row__actions">
                <Link className="button button--primary button--compact" to={appRoutes.wifiDetail(location.id)}>View details <ArrowRight aria-hidden="true" size={16} weight="bold" /></Link>
                {isOnline ? <a className="button button--quiet button--compact" href={wifiMapsUrl(location)} target="_blank" rel="noreferrer"><NavigationArrow aria-hidden="true" size={16} /> Open in maps</a> : <button className="button button--quiet button--compact" type="button" disabled>Open in maps</button>}
              </div>
            </article>
          ))}
        </div>
      ) : null}
      {locations.length > 0 ? <p className="data-footnote">Map information may be unavailable offline. Details may have changed since the saved update.</p> : null}
    </section>
  )
}
