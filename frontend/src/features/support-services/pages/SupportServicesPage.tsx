import {
  ArrowRight,
  CheckCircle,
  CloudSlash,
  HandHeart,
  LinkSimple,
  MapPin,
  Phone,
  Users,
  Warning,
  XCircle,
  X,
} from '@phosphor-icons/react'
import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { getSupportServiceRepository } from '../../../data/supportServiceRepository'
import { useRepositoryData } from '../../../data/useRepositoryData'
import { EmptyState } from '../../../shared/components/EmptyState'
import { LoadingState } from '../../../shared/components/LoadingState'
import { StatusBanner } from '../../../shared/components/StatusBanner'
import { useOnlineStatus } from '../../../shared/hooks/useOnlineStatus'
import { formatSavedDate } from '../../../shared/utils/formatDate'
import { ListMapToggle, type ResultsView } from '../../../shared/map/ListMapToggle'
import { LazyMapView } from '../../../shared/map/LazyMapView'
import { MapLegend } from '../../../shared/map/MapLegend'
import { supportMapRecords } from '../../../shared/map/mapRecords'
import { getSearchLocation, getSearchPostcode } from '../../../storage/searchLocationStorage'
import { getOfflinePreferences } from '../../../storage/onboardingDraftStorage'
import {
  formatServiceAddress,
  getAvailabilityPresentation,
  sortSupportServices,
  type AvailabilityTone,
} from '../utils/supportServicePresentation'
import { SupportDatasetDisclosure } from '../components/SupportDatasetDisclosure'
import { DirectionsPanel } from '../../../shared/map/DirectionsPanel'
import type { RoutePoint, RoutePreview } from '../../../data/api/directionsApi'

const serviceFilters = ['Food', 'Financial', 'Emergency', 'Housing'] as const
type ServiceFilter = (typeof serviceFilters)[number]

const serviceFilterTerms: Record<ServiceFilter, string[]> = {
  Food: ['food'],
  Financial: ['financial'],
  Emergency: ['emergency'],
  Housing: ['housing', 'homeless'],
}

function AvailabilityIcon({ tone }: { tone: AvailabilityTone }) {
  if (tone === 'normal') return <CheckCircle aria-hidden="true" size={19} weight="fill" />
  if (tone === 'closed') return <XCircle aria-hidden="true" size={19} weight="fill" />
  return <Warning aria-hidden="true" size={19} />
}

export function SupportServicesPage() {
  const postcode = getSearchPostcode()
  const searchLabel = getSearchLocation()?.label ?? postcode
  const repository = useMemo(
    () => getSupportServiceRepository(postcode),
    [postcode],
  )
  const { data, isLoading, error, retry } = useRepositoryData(repository.list)
  const [activeFilters, setActiveFilters] = useState<ServiceFilter[]>([])
  const [view, setView] = useState<ResultsView>('list')
  const [selectedMapIds, setSelectedMapIds] = useState<string[]>([])
  const [routePreview, setRoutePreview] = useState<RoutePreview>()
  const [selectedMapStart, setSelectedMapStart] = useState<RoutePoint>()
  const [isSelectingMapStart, setIsSelectingMapStart] = useState(false)
  const isOnline = useOnlineStatus()
  const offline = getOfflinePreferences()
  const canReadRecords = Boolean(data)
  const isSavedCopy = data?.metadata.dataOrigin === 'cache'
  const noOfflineCopy = !isOnline && !isLoading && !data
  const allServices = useMemo(
    () => sortSupportServices(data?.records ?? []),
    [data?.records],
  )
  const services = useMemo(() => {
    if (activeFilters.length === 0) return allServices
    return allServices.filter((service) =>
      activeFilters.some((filter) =>
        service.serviceTypes.some((type) =>
          serviceFilterTerms[filter].some((term) => type.toLowerCase().includes(term)),
        ),
      ),
    )
  }, [activeFilters, allServices])
  const mapRecords = useMemo(() => supportMapRecords(services), [services])
  const effectiveView = isOnline ? view : 'list'
  const effectiveSelectedMapIds = selectedMapIds.filter((id) => mapRecords.some((record) => record.id === id))
  const selectedMapServices = services.filter((service) => effectiveSelectedMapIds.includes(service.id))
  const selectedMapService = selectedMapServices.length === 1 ? selectedMapServices[0] : undefined

  const handleMapSelect = useCallback((ids: string[]) => {
    setRoutePreview(undefined)
    setIsSelectingMapStart(false)
    setSelectedMapIds((current) => current.length === ids.length && current.every((id) => ids.includes(id)) ? [] : ids)
  }, [])

  const handleSelectMapStart = useCallback((point: RoutePoint) => {
    setSelectedMapStart(point)
    setIsSelectingMapStart(false)
  }, [])

  function showServiceOnMap(id: string) {
    setSelectedMapIds([id])
    setRoutePreview(undefined)
    setView('map')
    window.requestAnimationFrame(() => document.querySelector('.map-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  function clearFilters() {
    setActiveFilters([])
    setSelectedMapIds([])
    setRoutePreview(undefined)
  }

  function toggleFilter(filter: ServiceFilter) {
    setActiveFilters((current) => current.includes(filter)
      ? current.filter((item) => item !== filter)
      : [...current, filter])
    setSelectedMapIds([])
    setRoutePreview(undefined)
  }
  return (
    <section className="content-page" aria-labelledby="support-title">
      <div className="connectivity-strip"><CloudSlash aria-hidden="true" size={21} /><span><strong>{isOnline ? (data?.metadata.cachedAt ? 'Saved for offline use' : offline.supportSaved ? 'Preparing offline copy' : 'Online — not saved for offline use') : isSavedCopy ? 'You are offline — showing saved copy' : 'You are offline'}</strong><small>{canReadRecords ? `Showing ${isSavedCopy ? 'saved' : 'current'} information near ${postcode}. ${data?.metadata.cachedAt ? `Saved on this device: ${formatSavedDate(data.metadata.cachedAt)}.` : ''}` : noOfflineCopy ? 'No Support information is saved for this postcode.' : 'Loading Support information…'}</small></span></div>
      <div className="page-heading">
        <div>
          <h1 id="support-title">Nearby support services</h1>
          <p>Nearest available services around {searchLabel}. Addresses may be in nearby suburbs.</p>
        </div>
        <Link className="button location-change" to={`${appRoutes.location}?next=${encodeURIComponent(appRoutes.support)}`}>
          <MapPin aria-hidden="true" size={18} weight="fill" />
          <span>Change location</span>
        </Link>
      </div>
      {data && allServices.length > 0 ? (
        <div className="results-toolbar">
          <p className="results-count">Showing {services.length}{services.length !== allServices.length ? ` of ${allServices.length}` : ''} services.</p>
          <ListMapToggle mapDisabled={!isOnline} value={effectiveView} onChange={(nextView) => { setView(nextView); if (nextView === 'list') { setSelectedMapIds([]); setRoutePreview(undefined) } }} />
          {!isOnline ? <small>Map view needs an internet connection.</small> : null}
        </div>
      ) : null}
      {data && allServices.length > 0 ? (
        <section className="support-filters" aria-labelledby="support-filter-title">
          <div className="support-filters__heading">
            <div>
              <h2 id="support-filter-title">Filter by service type</h2>
              <p>Select one or more options. Results matching any selected type will be shown.</p>
            </div>
            {activeFilters.length > 0 ? <button className="support-filters__clear" type="button" onClick={clearFilters}>Clear all</button> : null}
          </div>
          <div className="filter-row" aria-label="Service type filters">
            <button aria-pressed={activeFilters.length === 0} className={activeFilters.length === 0 ? 'filter-chip is-active' : 'filter-chip'} type="button" onClick={clearFilters}>All services</button>
            {serviceFilters.map((item) => <button aria-pressed={activeFilters.includes(item)} className={activeFilters.includes(item) ? 'filter-chip is-active' : 'filter-chip'} key={item} type="button" onClick={() => toggleFilter(item)}>{item}</button>)}
          </div>
          {activeFilters.length > 0 ? (
            <p className="support-filters__status" role="status">
              <strong>Active filters:</strong> {activeFilters.join(', ')}. Showing {services.length} of {allServices.length} services.
            </p>
          ) : null}
        </section>
      ) : null}
      {isLoading ? <LoadingState /> : null}
      {error && !noOfflineCopy ? <div className="error-state" role="alert"><p>{error}</p><button className="button button--quiet" type="button" onClick={retry}>Try again</button></div> : null}
      {noOfflineCopy ? <EmptyState title="No saved support information available offline" action={<Link className="button button--primary" to={appRoutes.offlineInformation}>Choose offline information</Link>}><p>Connect to the internet and download Support information before the next disruption.</p></EmptyState> : null}
      {data?.metadata.refreshError ? <StatusBanner title="Couldn’t update — showing your saved copy" tone="warning"><p>{data.metadata.refreshError} Saved on this device: {formatSavedDate(data.metadata.cachedAt)}.</p></StatusBanner> : null}
      {data?.metadata.freshnessStatus === 'stale' && canReadRecords && !data.metadata.refreshError ? <StatusBanner title="This saved support information may be out of date" tone="warning"><p>Saved copy: {formatSavedDate(data.metadata.cachedAt ?? data.metadata.generatedAt)}. Reconnect and <Link to={appRoutes.offlineInformation}>update saved information</Link> before relying on service details.</p></StatusBanner> : null}
      {data && canReadRecords ? <SupportDatasetDisclosure metadata={data.metadata} /> : null}
      {data && canReadRecords && allServices.length === 0 ? <EmptyState title="No nearby support services are listed" action={<Link className="button button--quiet" to={appRoutes.editProfile}>Check your postcode</Link>}><p>No support services in the current dataset match postcode {postcode}.</p><p>This does not confirm that help is unavailable. The dataset may be incomplete or out of date.</p></EmptyState> : null}
      {data && canReadRecords && allServices.length > 0 && effectiveView === 'list' ? (
        <div className="service-list">
          {services.map((service) => {
            const availability = getAvailabilityPresentation(service)
            return (
              <article className="service-card" key={service.id}>
                <div className="service-card__heading"><span className="record-row__icon"><HandHeart aria-hidden="true" size={25} weight="duotone" /></span><div><h2>{service.name}</h2><p><MapPin aria-hidden="true" size={17} /> {service.address ? formatServiceAddress(service) : `${service.suburb} VIC ${service.postcode} · Street address not confirmed`} · {service.distanceKm === undefined ? 'Distance not confirmed' : `${service.distanceKm} km`}</p><p><Phone aria-hidden="true" size={17} /> {service.phone ?? 'Phone not published'}{service.website ? <> · <a className="service-contact-link" href={service.website} target="_blank" rel="noreferrer"><LinkSimple aria-hidden="true" size={15} /> Website</a></> : null}</p></div></div>
                <div className="service-tags">{service.serviceTypes.map((type) => <span key={type}>{type}</span>)}</div>
<<<<<<< HEAD
                {availability.tone !== 'not-confirmed' ? (
                  <div className={`availability availability--${availability.tone}`}>
                    <AvailabilityIcon tone={availability.tone} />
                    <span><strong>{availability.title}</strong><small>{availability.detail}</small></span>
                  </div>
                ) : null}
                <div className="service-card__actions">
                  <Link className="service-card__link" to={appRoutes.supportDetail(service.id)}>View service details <ArrowRight aria-hidden="true" size={19} weight="bold" /></Link>
                  <button className="button button--quiet button--compact" type="button" onClick={() => showServiceOnMap(service.id)} disabled={!isOnline}><MapPin aria-hidden="true" size={16} /> Show on map</button>
=======
                <p className="service-card__provided"><strong>Services provided:</strong> {service.serviceTypes.join(', ')}</p>
                <div className={`availability availability--${availability.tone}`}>
                  <AvailabilityIcon tone={availability.tone} />
                  <span><strong>{availability.title}</strong><small>{availability.detail}</small></span>
>>>>>>> 240220e278c8da9dcb0df536bb94ca4d283058f2
                </div>
              </article>
            )
          })}
          {!services.length ? <p className="empty-filter" role="status">No services match the selected filters. Try another category or clear all filters.</p> : null}
        </div>
      ) : null}
      {data && canReadRecords && allServices.length > 0 && effectiveView === 'map' ? (
        <div className="map-results">
          {mapRecords.length > 0 ? (
            <>
              <LazyMapView
                ariaLabel={`Map of nearby support services around ${searchLabel}`}
                markers={mapRecords}
                selectedIds={effectiveSelectedMapIds}
                onSelect={handleMapSelect}
                onReturnToList={() => setView('list')}
                route={routePreview}
                isSelectingStart={isSelectingMapStart}
                onSelectStart={handleSelectMapStart}
              />
              <MapLegend items={[{ label: 'Support service', variant: 'support' }]} />
              {mapRecords.length < services.length ? (
                <p className="map-note" role="status">
                  {services.length - mapRecords.length} filtered result{services.length - mapRecords.length === 1 ? '' : 's'} without coordinates remain available in the list.
                </p>
              ) : null}
              {selectedMapService ? (() => {
                const availability = getAvailabilityPresentation(selectedMapService)
                const partnerLabel = selectedMapService.partnerStatus === 'partner'
                  ? 'Partner service'
                  : selectedMapService.partnerStatus === 'open-referral'
                    ? 'Open-referral service'
                    : 'Partner relationship not confirmed'
                return (
                  <>
                  {selectedMapService.latitude != null && selectedMapService.longitude != null ? (
                    <DirectionsPanel
                      key={selectedMapService.id}
                      destination={{ name: selectedMapService.name, latitude: selectedMapService.latitude, longitude: selectedMapService.longitude }}
                      destinationIsApproximate
                      onRouteChange={setRoutePreview}
                      selectedMapStart={selectedMapStart}
                      isSelectingMapStart={isSelectingMapStart}
                      onRequestMapStart={() => setIsSelectingMapStart((current) => !current)}
                    />
                  ) : null}
                  <article className="map-detail-card" aria-live="polite">
                    <button className="map-detail-card__close" type="button" aria-label="Close service details" onClick={() => { setSelectedMapIds([]); setRoutePreview(undefined) }}><X aria-hidden="true" size={21} /></button>
                    <div className="map-detail-card__heading">
                      <span className="record-row__icon"><HandHeart aria-hidden="true" size={25} weight="duotone" /></span>
                      <div>
                        <h2>{selectedMapService.name}</h2>
                      </div>
                    </div>
                    <div className="map-detail-card__facts">
                      <p><MapPin aria-hidden="true" size={17} /> {selectedMapService.address ? formatServiceAddress(selectedMapService) : `${selectedMapService.suburb} VIC ${selectedMapService.postcode} · Street address not confirmed`} · {selectedMapService.distanceKm === undefined ? 'Distance not confirmed' : `${selectedMapService.distanceKm} km`}</p>
                      <p><Phone aria-hidden="true" size={17} /> {selectedMapService.phone ?? 'Phone not published'}</p>
                      {selectedMapService.website ? <p><LinkSimple aria-hidden="true" size={17} /> <a className="service-contact-link" href={selectedMapService.website} target="_blank" rel="noreferrer">Website</a></p> : null}
                    </div>
                    {availability.tone !== 'not-confirmed' ? (
                      <div className={`availability availability--${availability.tone}`}>
                        <AvailabilityIcon tone={availability.tone} />
                        <span><strong>{availability.title}</strong><small>{availability.detail}</small></span>
                      </div>
                    ) : null}
                    <div className="map-support-details">
                      <section>
                        <h3>Services offered</h3>
                        <div className="service-tags">{selectedMapService.serviceTypes.map((type) => <span key={type}>{type}</span>)}</div>
                      </section>
                      <section>
                        <h3><Users aria-hidden="true" size={18} /> Eligibility</h3>
                        <p>{selectedMapService.eligibility ?? 'Eligibility information has not been published. Check directly before visiting.'}</p>
                      </section>
                      <section>
                        <h3><CheckCircle aria-hidden="true" size={18} /> Service relationship</h3>
                        <p>{partnerLabel}</p>
                      </section>
                    </div>
                  </article>
                  </>
                )
              })() : selectedMapServices.length > 1 ? (
                <section className="map-service-picker" aria-labelledby="map-service-picker-title">
                  <div className="map-service-picker__heading">
                    <div>
                      <h2 id="map-service-picker-title">Choose a support service</h2>
                      <p>Select a service to see its details and plan a route.</p>
                    </div>
                    <button className="map-detail-card__close" type="button" aria-label="Close service selection" onClick={() => setSelectedMapIds([])}><X aria-hidden="true" size={21} /></button>
                  </div>
                  <div className="map-service-picker__list">
                    {selectedMapServices.map((service) => (
                      <button key={service.id} type="button" onClick={() => setSelectedMapIds([service.id])}>
                        <span><strong>{service.name}</strong><small>{service.address ? formatServiceAddress(service) : `${service.suburb} VIC ${service.postcode}`}</small></span>
                        <ArrowRight aria-hidden="true" size={18} weight="bold" />
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}
            </>
          ) : services.length === 0 ? (
            <EmptyState title="No services match the selected filters" action={<button className="button button--quiet" type="button" onClick={clearFilters}>Clear all filters</button>}>
              <p>Try another category or clear all filters to show every nearby support service.</p>
            </EmptyState>
          ) : (
            <EmptyState title="These results cannot be placed on the map" action={<button className="button button--quiet" type="button" onClick={() => setView('list')}>Return to list</button>}>
              <p>The current records do not include valid coordinates. Their details are still available in the list.</p>
            </EmptyState>
          )}
        </div>
      ) : null}
    </section>
  )
}
