import { CheckCircle, HandHeart, LinkSimple, MapPin, Phone, Users } from '@phosphor-icons/react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { getMockSupportServiceRepository } from '../../../data/mock/mockRepositories'
import { useRepositoryData } from '../../../data/useRepositoryData'
import { EmptyState } from '../../../shared/components/EmptyState'
import { LoadingState } from '../../../shared/components/LoadingState'
import { PageBackLink } from '../../../shared/components/PageBackLink'
import { PrototypeBadge } from '../../../shared/components/PrototypeBadge'
import { StatusBanner } from '../../../shared/components/StatusBanner'
import { useOnlineStatus } from '../../../shared/hooks/useOnlineStatus'
import { formatSavedDate } from '../../../shared/utils/formatDate'
import { getHouseholdProfile, getOfflinePreferences } from '../../../storage/onboardingDraftStorage'
import {
  formatServiceAddress,
  formatServiceDistance,
  getAvailabilityPresentation,
} from '../utils/supportServicePresentation'

export function SupportServiceDetailPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const fixture = searchParams.get('fixture')
  const repository = getMockSupportServiceRepository(fixture)
  const { data, isLoading, error, retry } = useRepositoryData(repository.list)
  const isOnline = useOnlineStatus()
  const offline = getOfflinePreferences()
  const postcode = getHouseholdProfile()?.postcode ?? '3453'
  if (isLoading) return <LoadingState />
  if (error) {
    return <section className="detail-page"><PageBackLink to={appRoutes.support}>Back to support list</PageBackLink><div className="error-state" role="alert"><p>{error}</p><button className="button button--quiet" type="button" onClick={retry}>Try again</button></div></section>
  }
  if (!isOnline && !offline.supportSaved) {
    return <section className="detail-page"><PageBackLink to={appRoutes.support}>Back to support list</PageBackLink><EmptyState title="This support record is not saved on this device"><p>Reconnect to view prototype records, or choose support information for offline use.</p></EmptyState></section>
  }
  const service = data?.records.find((record) => record.id === id)
  const fixtureQuery = fixture ? `?fixture=${encodeURIComponent(fixture)}` : ''
  if (!service) return <Navigate replace to={`${appRoutes.support}${fixtureQuery}`} />

  const availability = getAvailabilityPresentation(service)
  const bannerTone = availability.tone === 'normal'
    ? 'success'
    : availability.tone === 'not-confirmed'
      ? 'info'
      : 'warning'
  const partnerLabel = service.partnerStatus === 'partner'
    ? 'Example partner service'
    : service.partnerStatus === 'open-referral'
      ? 'Example open-referral service'
      : 'Partner relationship not confirmed'

  return (
    <section className="detail-page" aria-labelledby="service-detail-title">
      <PageBackLink to={`${appRoutes.support}${fixtureQuery}`}>Back to support list</PageBackLink>
      <div className="page-heading"><div><h1 id="service-detail-title">{service.name}</h1><PrototypeBadge /><p className="detail-updated">Saved copy: {formatSavedDate(service.dataUpdatedAt)} · {formatServiceDistance(service, postcode)}</p></div></div>
      {data?.metadata.freshnessStatus === 'stale' ? <StatusBanner title="This saved support information may be out of date" tone="warning"><p>Saved copy: {formatSavedDate(data.metadata.generatedAt)}. Reconnect and update saved information before relying on these details.</p></StatusBanner> : null}
      <StatusBanner title={availability.title} tone={bannerTone}><p>{availability.detail}</p></StatusBanner>
      <section className="detail-section" aria-labelledby="services-offered"><h2 id="services-offered">Services offered</h2>{service.serviceTypes.length ? <div className="service-offering-list">{service.serviceTypes.map((type) => <div key={type}><HandHeart aria-hidden="true" size={22} weight="duotone" /><span>{type}</span></div>)}</div> : <p className="missing-detail">Specific services have not been published.</p>}</section>
      <section className="detail-section" aria-labelledby="eligibility"><h2 id="eligibility">Eligibility</h2><div className="eligibility-box"><Users aria-hidden="true" size={22} /><p>{service.eligibility ?? 'Eligibility information has not been published. Check directly before visiting.'}</p></div><p className="data-footnote">Conditions may change. Check directly before travelling.</p></section>
      <section className="detail-section" aria-labelledby="contact"><h2 id="contact">Contact and location</h2><div className="contact-card">{service.phone ? <div className="contact-card__phone"><Phone aria-hidden="true" size={23} /><span><strong>{service.phone}</strong><small>Example only — not callable</small></span></div> : <div><Phone aria-hidden="true" size={21} /><span><strong>Phone not published</strong><small>Check the service's official information when online.</small></span></div>}{service.website ? <div><LinkSimple aria-hidden="true" size={21} /><a className="service-contact-link" href={service.website} target="_blank" rel="noreferrer">Open example website</a></div> : <div><LinkSimple aria-hidden="true" size={21} /><span>Website not published</span></div>}<div><MapPin aria-hidden="true" size={21} /><span>{formatServiceAddress(service)}</span></div></div></section>
      <div className="partner-note"><CheckCircle aria-hidden="true" size={21} weight="fill" /><span>{partnerLabel}</span></div>
    </section>
  )
}
