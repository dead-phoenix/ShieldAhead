import { CheckCircle, HandHeart, Info, LinkSimple, MapPin, Phone, Users } from '@phosphor-icons/react'
import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { getSupportServiceRepository } from '../../../data/supportServiceRepository'
import { useRepositoryData } from '../../../data/useRepositoryData'
import { EmptyState } from '../../../shared/components/EmptyState'
import { LoadingState } from '../../../shared/components/LoadingState'
import { PageBackLink } from '../../../shared/components/PageBackLink'
import { StatusBanner } from '../../../shared/components/StatusBanner'
import { useOnlineStatus } from '../../../shared/hooks/useOnlineStatus'
import { formatSavedDate } from '../../../shared/utils/formatDate'
import { getSearchPostcode } from '../../../storage/searchLocationStorage'
import {
  formatServiceAddress,
  formatServiceDistance,
  getAvailabilityPresentation,
} from '../utils/supportServicePresentation'
import { SupportDatasetDisclosure } from '../components/SupportDatasetDisclosure'

export function SupportServiceDetailPage() {
  const { id } = useParams()
  const postcode = getSearchPostcode()
  const repository = useMemo(
    () => getSupportServiceRepository(postcode),
    [postcode],
  )
  const { data, isLoading, error, retry } = useRepositoryData(repository.list)
  const isOnline = useOnlineStatus()
  if (isLoading) return <LoadingState />
  if (!isOnline && !data) {
    return <section className="detail-page"><PageBackLink to={appRoutes.support}>Back to support list</PageBackLink><EmptyState title="This support record is not saved on this device" action={<Link className="button button--primary" to={appRoutes.offlineInformation}>Choose offline information</Link>}><p>Reconnect and download Support information before opening it offline.</p></EmptyState></section>
  }
  if (error) {
    return <section className="detail-page"><PageBackLink to={appRoutes.support}>Back to support list</PageBackLink><div className="error-state" role="alert"><p>{error}</p><button className="button button--quiet" type="button" onClick={retry}>Try again</button></div></section>
  }
  const service = data?.records.find((record) => record.id === id)
  if (!service) {
    return <section className="detail-page"><PageBackLink to={appRoutes.support}>Back to support list</PageBackLink><EmptyState title="This service could not be found" action={<Link className="button button--quiet" to={appRoutes.support}>View nearby services</Link>}><p>The listing may have been updated or removed. Return to the current results before making travel plans.</p></EmptyState></section>
  }

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
      <div className="page-heading"><div><h1 id="service-detail-title">{service.name}</h1><p className="detail-updated">Data updated: {formatSavedDate(service.dataUpdatedAt)} · {formatServiceDistance(service, postcode)}</p></div></div>
      {data?.metadata.refreshError ? <StatusBanner title="Couldn’t update — showing your saved copy" tone="warning"><p>{data.metadata.refreshError} Saved on this device: {formatSavedDate(data.metadata.cachedAt)}.</p></StatusBanner> : null}
      {data?.metadata.freshnessStatus === 'stale' && !data.metadata.refreshError ? <StatusBanner title="This saved support information may be out of date" tone="warning"><p>Saved copy: {formatSavedDate(data.metadata.cachedAt ?? data.metadata.generatedAt)}. Reconnect and update saved information before relying on these details.</p></StatusBanner> : null}
      <StatusBanner title={availability.title} tone={bannerTone}><p>{availability.detail}</p></StatusBanner>
      <section className="detail-section" aria-labelledby="services-offered"><h2 id="services-offered">Services offered</h2>{service.serviceTypes.length ? <div className="service-offering-list">{service.serviceTypes.map((type) => <div key={type}><HandHeart aria-hidden="true" size={22} weight="duotone" /><span>{type}</span></div>)}</div> : <p className="missing-detail">Specific services have not been published.</p>}</section>
      <section className="detail-section" aria-labelledby="eligibility"><h2 id="eligibility">Eligibility</h2><div className="eligibility-box"><Users aria-hidden="true" size={22} /><p>{service.eligibility ?? 'Eligibility information has not been published. Check directly before visiting.'}</p></div><p className="data-footnote">Conditions may change. Check directly before travelling.</p></section>
      <section className="detail-section" aria-labelledby="contact"><h2 id="contact">Contact and location</h2><div className="contact-card">{service.phone ? <div className="contact-card__phone"><Phone aria-hidden="true" size={23} /><span><strong>{service.phone}</strong><small>Call to confirm details before travelling.</small></span></div> : <div><Phone aria-hidden="true" size={21} /><span><strong>Phone not published</strong><small>Check the service's official information when online.</small></span></div>}{service.website ? <div><LinkSimple aria-hidden="true" size={21} /><a className="service-contact-link" href={service.website} target="_blank" rel="noreferrer">Open organisation website</a></div> : <div><LinkSimple aria-hidden="true" size={21} /><span>Website not published</span></div>}<div><MapPin aria-hidden="true" size={21} /><span>{formatServiceAddress(service)}</span></div></div></section>
      <div className="partner-note"><PartnerIcon aria-hidden="true" size={21} weight={PartnerIcon === CheckCircle ? 'fill' : 'regular'} /><span>{partnerLabel}</span></div>
      {data ? <SupportDatasetDisclosure metadata={data.metadata} /> : null}
    </section>
  )
}
