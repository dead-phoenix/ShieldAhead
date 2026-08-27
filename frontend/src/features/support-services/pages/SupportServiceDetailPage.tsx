import { CheckCircle, HandHeart, Info, MapPin, Phone, Users } from '@phosphor-icons/react'
import { Navigate, useParams } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { mockSupportServiceRepository } from '../../../data/mock/mockRepositories'
import { useRepositoryData } from '../../../data/useRepositoryData'
import { LoadingState } from '../../../shared/components/LoadingState'
import { EmptyState } from '../../../shared/components/EmptyState'
import { PageBackLink } from '../../../shared/components/PageBackLink'
import { PrototypeBadge } from '../../../shared/components/PrototypeBadge'
import { formatSavedDate } from '../../../shared/utils/formatDate'
import { useOnlineStatus } from '../../../shared/hooks/useOnlineStatus'
import { getOfflinePreferences } from '../../../storage/onboardingDraftStorage'

export function SupportServiceDetailPage() {
  const { id } = useParams()
  const { data, isLoading, error, retry } = useRepositoryData(mockSupportServiceRepository.list)
  const isOnline = useOnlineStatus()
  const offline = getOfflinePreferences()
  if (isLoading) return <LoadingState />
  if (error) {
    return <section className="detail-page"><PageBackLink to={appRoutes.support}>Back to support list</PageBackLink><div className="error-state" role="alert"><p>{error}</p><button className="button button--quiet" type="button" onClick={retry}>Try again</button></div></section>
  }
  if (!isOnline && !offline.supportSaved) {
    return <section className="detail-page"><PageBackLink to={appRoutes.support}>Back to support list</PageBackLink><EmptyState title="This support record is not saved on this device"><p>Reconnect to view prototype records, or choose support information for offline use.</p></EmptyState></section>
  }
  const service = data?.records.find((record) => record.id === id)
  if (!service) return <Navigate replace to={appRoutes.support} />

  return (
    <section className="detail-page" aria-labelledby="service-detail-title">
      <PageBackLink to={appRoutes.support}>Back to support list</PageBackLink>
      <div className="page-heading"><div><h1 id="service-detail-title">{service.name}</h1><PrototypeBadge /><p className="detail-updated">Saved copy: {formatSavedDate(service.dataUpdatedAt)} · {service.distanceKm} km from Harcourt 3453</p></div></div>
      <div className="notice-card"><Info aria-hidden="true" size={22} /><p><strong>Availability not confirmed.</strong> Call before travelling to ensure this service can assist you today.</p></div>
      <section className="detail-section" aria-labelledby="services-offered"><h2 id="services-offered">Services offered</h2><div className="service-offering-list">{service.serviceTypes.map((type) => <div key={type}><HandHeart aria-hidden="true" size={22} weight="duotone" /><span>{type}</span></div>)}</div></section>
      <section className="detail-section" aria-labelledby="eligibility"><h2 id="eligibility">Eligibility</h2><div className="eligibility-box"><Users aria-hidden="true" size={22} /><p>{service.eligibility}</p></div><p className="data-footnote">Conditions may change. Check directly before travelling.</p></section>
      <section className="detail-section" aria-labelledby="contact"><h2 id="contact">Contact and location</h2><div className="contact-card"><div className="contact-card__phone"><Phone aria-hidden="true" size={23} /><span><strong>{service.phone}</strong><small>Example only — not callable</small></span></div><div><MapPin aria-hidden="true" size={21} /><span>{service.address}<br />{service.suburb} VIC {service.postcode}</span></div></div></section>
      <div className="partner-note"><CheckCircle aria-hidden="true" size={21} weight="fill" /><span>{service.partnerStatus === 'partner' ? 'Example partner service' : 'Open-referral example service'}</span></div>
    </section>
  )
}
