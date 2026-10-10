import { CheckCircle, HandHeart, Info, LinkSimple, MapPin, Phone, Users } from '@phosphor-icons/react'
import { useMemo } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import type { DatasetMetadata, SupportService } from '../../../data/contracts'
import { getSupportServiceRepository } from '../../../data/supportServiceRepository'
import { useRepositoryData } from '../../../data/useRepositoryData'
import { EmptyState } from '../../../shared/components/EmptyState'
import { LoadingState } from '../../../shared/components/LoadingState'
import { PageBackLink } from '../../../shared/components/PageBackLink'
import { StatusBanner } from '../../../shared/components/StatusBanner'
import { useOnlineStatus } from '../../../shared/hooks/useOnlineStatus'
import { formatSavedDate } from '../../../shared/utils/formatDate'
import { getMyArea } from '../../../storage/myAreaStorage'
import { getSearchPostcode } from '../../../storage/searchLocationStorage'
import { OfflinePlaceUnavailable } from '../../saved-places/components/OfflinePlaceUnavailable'
import { SavedOnNotice } from '../../saved-places/components/SavedOnNotice'
import { SavePlaceButton } from '../../saved-places/components/SavePlaceButton'
import {
  savedPlaceFromSupportService,
  savedPlaceKey,
  supportServiceFromSavedPlace,
} from '../../saved-places/savedPlaceRecords'
import { useCachedSupportService } from '../../saved-places/useCachedSupportService'
import { useSavedPlaces } from '../../saved-places/useSavedPlaces'
import {
  formatServiceAddress,
  formatServiceDistance,
  getAvailabilityPresentation,
} from '../utils/supportServicePresentation'
import { SupportDatasetDisclosure } from '../components/SupportDatasetDisclosure'

function distanceFromMyArea(service: SupportService): string {
  return service.distanceKm === undefined
    ? 'Distance from My area not confirmed'
    : `${service.distanceKm} km from My area`
}

interface SupportServiceViewProps {
  service: SupportService
  distanceText: string
  metadata?: DatasetMetadata
  /** Set when the page shows a copy saved on this device rather than a live download. */
  savedAt?: string
}

function SupportServiceView({ service, distanceText, metadata, savedAt }: SupportServiceViewProps) {
  const availability = getAvailabilityPresentation(service)
  const bannerTone = availability.tone === 'normal'
    ? 'success'
    : availability.tone === 'not-confirmed'
      ? 'info'
      : 'warning'
  const partnerLabel = service.partnerStatus === 'partner'
    ? 'Partner service'
    : service.partnerStatus === 'open-referral'
      ? 'Open-referral service'
      : 'Partner relationship not confirmed'
  const PartnerIcon = service.partnerStatus === 'unknown' || !service.partnerStatus
    ? Info
    : CheckCircle

  return (
    <section className="detail-page" aria-labelledby="service-detail-title">
      <PageBackLink to={appRoutes.support}>Back to support list</PageBackLink>
      <div className="page-heading page-heading--saveable"><div><h1 id="service-detail-title">{service.name}</h1><p className="detail-updated">Data updated: {formatSavedDate(service.dataUpdatedAt)} · {distanceText}</p></div><SavePlaceButton place={savedPlaceFromSupportService(service)} /></div>
      {savedAt ? <SavedOnNotice savedAt={savedAt} /> : null}
      {metadata?.refreshError ? <StatusBanner title="Couldn’t update — showing your saved copy" tone="warning"><p>{metadata.refreshError} Saved on this device: {formatSavedDate(metadata.cachedAt)}.</p></StatusBanner> : null}
      {metadata?.freshnessStatus === 'stale' && !metadata.refreshError && !savedAt ? <StatusBanner title="This saved support information may be out of date" tone="warning"><p>Saved copy: {formatSavedDate(metadata.cachedAt ?? metadata.generatedAt)}. Reconnect and update saved information before relying on these details.</p></StatusBanner> : null}
      {availability.tone !== 'not-confirmed' ? <StatusBanner title={availability.title} tone={bannerTone}><p>{availability.detail}</p></StatusBanner> : null}
      <section className="detail-section" aria-labelledby="services-offered"><h2 id="services-offered">Services offered</h2>{service.serviceTypes.length ? <div className="service-offering-list">{service.serviceTypes.map((type) => <div key={type}><HandHeart aria-hidden="true" size={22} weight="duotone" /><span>{type}</span></div>)}</div> : <p className="missing-detail">Specific services have not been published.</p>}</section>
      <section className="detail-section" aria-labelledby="eligibility"><h2 id="eligibility">Eligibility</h2><div className="eligibility-box"><Users aria-hidden="true" size={22} /><p>{service.eligibility ?? 'Eligibility information has not been published. Check directly before visiting.'}</p></div><p className="data-footnote">Conditions may change. Check directly before travelling.</p></section>
      <section className="detail-section" aria-labelledby="contact"><h2 id="contact">Contact and location</h2><div className="contact-card">{service.phone ? <div className="contact-card__phone"><Phone aria-hidden="true" size={23} /><span><strong>{service.phone}</strong><small>Call to confirm details before travelling.</small></span></div> : <div><Phone aria-hidden="true" size={21} /><span><strong>Phone not published</strong><small>Check the service's official information when online.</small></span></div>}{service.website ? <div><LinkSimple aria-hidden="true" size={21} /><a className="service-contact-link" href={service.website} target="_blank" rel="noreferrer">Open organisation website</a></div> : <div><LinkSimple aria-hidden="true" size={21} /><span>Website not published</span></div>}<div><MapPin aria-hidden="true" size={21} /><span>{formatServiceAddress(service)}</span></div></div></section>
      <div className="partner-note"><PartnerIcon aria-hidden="true" size={21} weight={PartnerIcon === CheckCircle ? 'fill' : 'regular'} /><span>{partnerLabel}</span></div>
      {metadata ? <SupportDatasetDisclosure metadata={metadata} /> : null}
    </section>
  )
}

export function SupportServiceDetailPage() {
  const { id } = useParams()
  const routeLocation = useLocation()
  const navigationPostcode = (routeLocation.state as { searchPostcode?: unknown } | null)?.searchPostcode
  const postcode = typeof navigationPostcode === 'string' ? navigationPostcode : getSearchPostcode()
  const repository = useMemo(
    () => getSupportServiceRepository(postcode),
    [postcode],
  )
  const { data, isLoading, error, retry } = useRepositoryData(repository.list)
  const isOnline = useOnlineStatus()
  const savedPlaces = useSavedPlaces()
  const liveService = data?.records.find((record) => record.id === id)
  const savedPlace = savedPlaces.find((place) => place.key === savedPlaceKey('support', id ?? ''))
  const cached = useCachedSupportService(id, !isLoading && !liveService && !savedPlace)

  if (isLoading) return <LoadingState />
  if (liveService && data) {
    const fromMyAreaCache = data.metadata.dataOrigin === 'cache' && postcode === getMyArea()?.postcode
    return (
      <SupportServiceView
        service={liveService}
        distanceText={fromMyAreaCache ? distanceFromMyArea(liveService) : formatServiceDistance(liveService, postcode)}
        metadata={data.metadata}
        savedAt={data.metadata.dataOrigin === 'cache' && !data.metadata.refreshError ? data.metadata.cachedAt : undefined}
      />
    )
  }
  if (savedPlace) {
    return <SupportServiceView service={supportServiceFromSavedPlace(savedPlace)} distanceText="Distance not saved with this place" savedAt={savedPlace.savedAt} />
  }
  if (cached.status === 'loading') return <LoadingState />
  if (cached.status === 'done' && cached.service && cached.cache) {
    return <SupportServiceView service={cached.service} distanceText={distanceFromMyArea(cached.service)} metadata={cached.cache.metadata} savedAt={cached.cache.savedAt} />
  }
  if (!isOnline) {
    return <section className="detail-page"><PageBackLink to={appRoutes.saved}>Back to saved places</PageBackLink><OfflinePlaceUnavailable /></section>
  }
  if (error) {
    return <section className="detail-page"><PageBackLink to={appRoutes.support}>Back to support list</PageBackLink><div className="error-state" role="alert"><p>{error}</p><button className="button button--quiet" type="button" onClick={retry}>Try again</button></div></section>
  }
  return <section className="detail-page"><PageBackLink to={appRoutes.support}>Back to support list</PageBackLink><EmptyState title="This service could not be found" action={<Link className="button button--quiet" to={appRoutes.support}>View nearby services</Link>}><p>The listing may have been updated or removed. Return to the current results before making travel plans.</p></EmptyState></section>
}
