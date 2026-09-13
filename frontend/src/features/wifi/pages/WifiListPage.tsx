import { ArrowRight, Clock, CloudSlash, Heart, Info, MapPin, NavigationArrow, ShieldCheck, WifiHigh, X } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { useRepositoryData } from '../../../data/useRepositoryData'
import { getWifiRepository } from '../../../data/wifiRepository'
import { LoadingState } from '../../../shared/components/LoadingState'
import { EmptyState } from '../../../shared/components/EmptyState'
import { StatusBanner } from '../../../shared/components/StatusBanner'
import { useOnlineStatus } from '../../../shared/hooks/useOnlineStatus'
import { formatSavedDate } from '../../../shared/utils/formatDate'
import { ListMapToggle, type ResultsView } from '../../../shared/map/ListMapToggle'
import { LazyMapView } from '../../../shared/map/LazyMapView'
import { MapLegend } from '../../../shared/map/MapLegend'
import { wifiMapRecords } from '../../../shared/map/mapRecords'
import { getSearchLocation, getSearchPostcode } from '../../../storage/searchLocationStorage'
import { clearUsualWifiSpot, getOfflinePreferences, getUsualWifiSpot } from '../../../storage/onboardingDraftStorage'
import { selectWifiLocationsForList } from '../utils/sortWifiLocations'
import { wifiAreaLabel } from '../utils/wifiMapsUrl'
import { WifiVerificationBadge } from '../components/WifiVerificationBadge'
import { DirectionsPanel } from '../../../shared/map/DirectionsPanel'
import type { RoutePoint, RoutePreview } from '../../../data/api/directionsApi'

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
  const [view, setView] = useState<ResultsView>('list')
  const [selectedMapIds, setSelectedMapIds] = useState<string[]>([])
  const [routePreview, setRoutePreview] = useState<RoutePreview>()
  const [selectedMapStart, setSelectedMapStart] = useState<RoutePoint>()
  const [isSelectingMapStart, setIsSelectingMapStart] = useState(false)
  const mapRecords = useMemo(() => wifiMapRecords(locations), [locations])
  const effectiveView = isOnline ? view : 'list'
  const effectiveSelectedMapIds = selectedMapIds.filter((id) => mapRecords.some((record) => record.id === id))
  const selectedMapLocation = effectiveSelectedMapIds.length === 1
    ? locations.find((location) => location.id === effectiveSelectedMapIds[0])
    : undefined

  const handleMapSelect = useCallback((ids: string[]) => {
    setRoutePreview(undefined)
    setIsSelectingMapStart(false)
    setSelectedMapIds((current) => current.length === ids.length && current.every((id) => ids.includes(id)) ? [] : ids)
  }, [])

  const handleSelectMapStart = useCallback((point: RoutePoint) => {
    setSelectedMapStart(point)
    setIsSelectingMapStart(false)
  }, [])

  useEffect(() => {
    if (removedUsualSpot) clearUsualWifiSpot()
  }, [removedUsualSpot])

  function locationLabel(location: (typeof locations)[number]) {
    return wifiAreaLabel(location)
  }

  function showLocationOnMap(id: string) {
    setSelectedMapIds([id])
    setRoutePreview(undefined)
    setView('map')
    window.requestAnimationFrame(() => {
      const mapResults = document.querySelector<HTMLElement>('.map-results')
      if (mapResults && typeof mapResults.scrollIntoView === 'function') {
        mapResults.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    })
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
      {data && locations.length > 0 ? (
        <div className="results-toolbar">
          <p className="results-count">Showing {locations.length} nearest result{locations.length === 1 ? '' : 's'}{data.records.length > locations.length ? ` out of ${data.records.length}` : ''}.</p>
          <ListMapToggle mapDisabled={!isOnline} value={effectiveView} onChange={(nextView) => { setView(nextView); if (nextView === 'list') { setSelectedMapIds([]); setRoutePreview(undefined) } }} />
          {!isOnline ? <small>Map view needs an internet connection.</small> : null}
        </div>
      ) : null}
      {isLoading ? <LoadingState /> : null}
      {error && !noOfflineCopy ? <div className="error-state" role="alert"><p>{error}</p><button className="button button--quiet" type="button" onClick={retry}>Try again</button></div> : null}
      {noOfflineCopy ? <EmptyState title="No saved Wi-Fi information available offline" action={<Link className="button button--primary" to={appRoutes.offlineInformation}>Choose offline information</Link>}><p>Connect to the internet and download Wi-Fi information before the next disruption.</p></EmptyState> : null}
      {data?.metadata.refreshError ? <StatusBanner title="Couldn’t update — showing your saved copy" tone="warning"><p>{data.metadata.refreshError} Saved on this device: {formatSavedDate(data.metadata.cachedAt)}.</p></StatusBanner> : null}
      {removedUsualSpot ? <StatusBanner title="Your usual spot is no longer listed" tone="warning"><p>The saved location was removed during a data refresh, so ShieldAhead cleared the old pin. Choose another place from the list when one is available.</p></StatusBanner> : null}
      {data?.metadata.freshnessStatus === 'stale' && canReadRecords && !data.metadata.refreshError ? <StatusBanner title="This saved Wi-Fi information may be out of date" tone="warning"><p>Saved copy: {formatSavedDate(data.metadata.cachedAt ?? data.metadata.generatedAt)}. Reconnect and <Link to={appRoutes.offlineInformation}>update saved information</Link> before travelling, if you can.</p></StatusBanner> : null}
      {data && canReadRecords && locations.length === 0 ? <EmptyState title="No verified Wi-Fi coverage for this area" action={<Link className="button button--quiet" to={appRoutes.offlineInformation}>Check saved information</Link>}><p>No verified public Wi-Fi locations are currently listed near {postcode}.</p><p>A local library is a general place to ask about internet access, but Wi-Fi availability and opening hours are not confirmed.</p></EmptyState> : null}
      {data && canReadRecords && locations.length > 0 && effectiveView === 'list' ? (
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
                <button className="button button--quiet button--compact" type="button" onClick={() => showLocationOnMap(location.id)} disabled={!isOnline}><MapPin aria-hidden="true" size={16} /> Show on map</button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
      {data && canReadRecords && locations.length > 0 && effectiveView === 'map' ? (
        <div className="map-results">
          {mapRecords.length > 0 ? (
            <>
              <LazyMapView
                ariaLabel={`Map of nearby free Wi-Fi around ${searchLabel}`}
                markers={mapRecords}
                selectedIds={effectiveSelectedMapIds}
                onSelect={handleMapSelect}
                onReturnToList={() => setView('list')}
                route={routePreview}
                isSelectingStart={isSelectingMapStart}
                onSelectStart={handleSelectMapStart}
              />
              <MapLegend items={[
                { label: 'Confirmed Wi-Fi', variant: 'confirmed' },
                { label: 'Likely Wi-Fi — check first', variant: 'likely' },
              ]} />
              {mapRecords.length < locations.length ? (
                <p className="map-note" role="status">
                  {locations.length - mapRecords.length} result{locations.length - mapRecords.length === 1 ? '' : 's'} without coordinates remain available in the list.
                </p>
              ) : null}
              {selectedMapLocation ? (
                <>
                {selectedMapLocation.latitude != null && selectedMapLocation.longitude != null ? (
                  <DirectionsPanel
                    key={selectedMapLocation.id}
                    destination={{ name: selectedMapLocation.name, latitude: selectedMapLocation.latitude, longitude: selectedMapLocation.longitude }}
                    onRouteChange={setRoutePreview}
                    selectedMapStart={selectedMapStart}
                    isSelectingMapStart={isSelectingMapStart}
                    onRequestMapStart={() => setIsSelectingMapStart((current) => !current)}
                  />
                ) : null}
                <article className="map-detail-card" aria-live="polite">
                  <button className="map-detail-card__close" type="button" aria-label="Close Wi-Fi details" onClick={() => { setSelectedMapIds([]); setRoutePreview(undefined) }}><X aria-hidden="true" size={21} /></button>
                  <div className="map-detail-card__heading">
                    <span className="record-row__icon"><WifiHigh aria-hidden="true" size={25} weight="duotone" /></span>
                    <div>
                      <h2>{selectedMapLocation.name}</h2>
                      <WifiVerificationBadge status={selectedMapLocation.verificationStatus} />
                    </div>
                  </div>
                  <div className={`notice-card${selectedMapLocation.verificationStatus ? ` notice-card--${selectedMapLocation.verificationStatus}` : ''}`}>
                    {selectedMapLocation.verificationStatus === 'confirmed' ? <ShieldCheck aria-hidden="true" size={22} /> : <Info aria-hidden="true" size={22} />}
                    <p>{selectedMapLocation.verificationStatus === 'confirmed'
                      ? 'This is a confirmed VicFreeWiFi location. Check the access conditions before travelling.'
                      : 'This facility is likely to offer Wi-Fi, but availability is not officially confirmed. Check with staff before travelling.'}</p>
                  </div>
                  <dl className="detail-list map-detail-list">
                    <div><dt><NavigationArrow aria-hidden="true" size={19} /> Distance</dt><dd>{selectedMapLocation.distanceKm === undefined ? 'Distance from your postcode is not confirmed' : `${selectedMapLocation.distanceKm} km from ${postcode}`}</dd></div>
                    <div><dt><MapPin aria-hidden="true" size={19} /> Address</dt><dd>{selectedMapLocation.address ? locationLabel(selectedMapLocation) : `Street address not confirmed. Exact map point available for ${locationLabel(selectedMapLocation)}.`}</dd></div>
                    <div><dt><Clock aria-hidden="true" size={19} /> Opening hours</dt><dd>{selectedMapLocation.openingHours ?? 'Opening hours not confirmed'}</dd></div>
                    <div><dt><WifiHigh aria-hidden="true" size={19} /> Access conditions</dt><dd>{selectedMapLocation.accessConditions?.length ? <ul>{selectedMapLocation.accessConditions.map((condition) => <li key={condition}>{condition}</li>)}</ul> : 'Access conditions not confirmed'}</dd></div>
                  </dl>
                </article>
                </>
              ) : null}
            </>
          ) : (
            <EmptyState title="These results cannot be placed on the map" action={<button className="button button--quiet" type="button" onClick={() => setView('list')}>Return to list</button>}>
              <p>The current records do not include valid coordinates. Their details are still available in the list.</p>
            </EmptyState>
          )}
        </div>
      ) : null}
      {locations.length > 0 ? <p className="data-footnote">Map information may be unavailable offline. Details may have changed since the saved update.</p> : null}
    </section>
  )
}
