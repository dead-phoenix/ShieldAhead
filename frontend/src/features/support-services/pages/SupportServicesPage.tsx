import { ArrowRight, CloudSlash, HandHeart, MapPin, Warning } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { mockSupportServiceRepository } from '../../../data/mock/mockRepositories'
import { useRepositoryData } from '../../../data/useRepositoryData'
import { LoadingState } from '../../../shared/components/LoadingState'
import { EmptyState } from '../../../shared/components/EmptyState'
import { PrototypeBadge } from '../../../shared/components/PrototypeBadge'
import { useOnlineStatus } from '../../../shared/hooks/useOnlineStatus'
import { formatSavedDate } from '../../../shared/utils/formatDate'
import { getHouseholdProfile, getOfflinePreferences } from '../../../storage/onboardingDraftStorage'

const filters = ['All services', 'Food', 'Financial', 'Emergency'] as const

export function SupportServicesPage() {
  const { data, isLoading, error, retry } = useRepositoryData(mockSupportServiceRepository.list)
  const [filter, setFilter] = useState<(typeof filters)[number]>('All services')
  const isOnline = useOnlineStatus()
  const postcode = getHouseholdProfile()?.postcode ?? '3453'
  const offline = getOfflinePreferences()
  const canReadRecords = isOnline || offline.supportSaved
  const services = useMemo(() => {
    if (!data || filter === 'All services') return data?.records ?? []
    return data.records.filter((service) => service.serviceTypes.some((type) => type.toLowerCase().includes(filter.toLowerCase())))
  }, [data, filter])

  return (
    <section className="content-page" aria-labelledby="support-title">
      <div className="connectivity-strip"><CloudSlash aria-hidden="true" size={21} /><span><strong>{isOnline ? (offline.supportSaved ? 'Saved for offline use' : 'Online — not saved for offline use') : 'You are offline'}</strong><small>{canReadRecords ? `Showing ${isOnline ? 'prototype' : 'saved'} information near ${postcode}. Saved copy: ${formatSavedDate(data?.metadata.generatedAt ?? offline.lastUpdatedAt)}.` : 'No support information was selected for offline use.'}</small></span></div>
      <div className="page-heading"><div><h1 id="support-title">Nearby support services</h1><p>Find assistance closest to you.</p></div><PrototypeBadge /></div>
      <div className="filter-row" aria-label="Filter support services">
        {filters.map((item) => <button aria-pressed={filter === item} className={filter === item ? 'filter-chip is-active' : 'filter-chip'} key={item} type="button" onClick={() => setFilter(item)}>{item}</button>)}
      </div>
      {isLoading ? <LoadingState /> : null}
      {error ? <div className="error-state" role="alert"><p>{error}</p><button className="button button--quiet" type="button" onClick={retry}>Try again</button></div> : null}
      {!canReadRecords ? <EmptyState title="No saved support information available offline" action={<Link className="button button--primary" to={appRoutes.offlineInformation}>Choose offline information</Link>}><p>Connect to the internet to view prototype records, or select support information for offline use.</p></EmptyState> : null}
      {data && canReadRecords ? (
        <div className="service-list">
          {services.map((service) => (
            <article className="service-card" key={service.id}>
              <div className="service-card__heading"><span className="record-row__icon"><HandHeart aria-hidden="true" size={25} weight="duotone" /></span><div><h2>{service.name}</h2><p><MapPin aria-hidden="true" size={17} /> {service.suburb} · {service.distanceKm} km</p></div></div>
              <div className="service-tags">{service.serviceTypes.map((type) => <span key={type}>{type}</span>)}</div>
              <div className={service.availabilityStatus === 'normal' ? 'availability availability--open' : 'availability availability--warning'}>
                {service.availabilityStatus === 'normal' ? <HandHeart aria-hidden="true" size={19} /> : <Warning aria-hidden="true" size={19} />}
                <span><strong>{service.availabilityStatus === 'normal' ? 'Example status — not verified' : 'Availability not confirmed'}</strong><small>{service.availabilityStatus === 'normal' ? `Saved copy: ${formatSavedDate(service.availabilityUpdatedAt)}` : 'Call ahead if a phone number is listed'}</small></span>
              </div>
              <Link className="service-card__link" to={appRoutes.supportDetail(service.id)}>View service details <ArrowRight aria-hidden="true" size={19} weight="bold" /></Link>
            </article>
          ))}
          {!services.length ? <p className="empty-filter" role="status">No example services match this filter. Try another category.</p> : null}
        </div>
      ) : null}
    </section>
  )
}
