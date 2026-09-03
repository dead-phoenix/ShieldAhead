import {
  ArrowRight,
  CheckCircle,
  CloudSlash,
  HandHeart,
  LinkSimple,
  MapPin,
  Phone,
  Warning,
  XCircle,
} from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { getSupportServiceRepository } from '../../../data/supportServiceRepository'
import { useRepositoryData } from '../../../data/useRepositoryData'
import { EmptyState } from '../../../shared/components/EmptyState'
import { LoadingState } from '../../../shared/components/LoadingState'
import { PrototypeBadge } from '../../../shared/components/PrototypeBadge'
import { StatusBanner } from '../../../shared/components/StatusBanner'
import { useOnlineStatus } from '../../../shared/hooks/useOnlineStatus'
import { formatSavedDate } from '../../../shared/utils/formatDate'
import { getHouseholdProfile, getOfflinePreferences } from '../../../storage/onboardingDraftStorage'
import {
  formatServiceAddress,
  getAvailabilityPresentation,
  sortSupportServices,
  type AvailabilityTone,
} from '../utils/supportServicePresentation'
import { SupportDatasetDisclosure } from '../components/SupportDatasetDisclosure'

const filters = ['All services', 'Food', 'Financial', 'Emergency'] as const

function AvailabilityIcon({ tone }: { tone: AvailabilityTone }) {
  if (tone === 'normal') return <CheckCircle aria-hidden="true" size={19} weight="fill" />
  if (tone === 'closed') return <XCircle aria-hidden="true" size={19} weight="fill" />
  return <Warning aria-hidden="true" size={19} />
}

export function SupportServicesPage() {
  const [searchParams] = useSearchParams()
  const fixture = searchParams.get('fixture')
  const isFixture = Boolean(fixture)
  const postcode = getHouseholdProfile()?.postcode ?? '3453'
  // Was: getMockSupportServiceRepository(fixture) — always mock, regardless
  // of VITE_DATA_SOURCE. This is the mode-aware version, same as wifi: it
  // uses mock automatically if ?fixture= is set or VITE_DATA_SOURCE isn't
  // "api", and calls the real backend otherwise.
  //
  // useMemo matters here, not just style: without it, a new repository (and
  // therefore a new repository.list function) is created on every render.
  // useRepositoryData re-fetches whenever that function reference changes,
  // and fetching triggers a re-render — creating an infinite fetch loop.
  // Mock data resolved fast enough that this was never visible; a real
  // network call exposed it as a burst of dozens of requests per second.
  const repository = useMemo(
    () => getSupportServiceRepository(fixture, postcode),
    [fixture, postcode],
  )
  const { data, isLoading, error, retry } = useRepositoryData(repository.list)
  const [filter, setFilter] = useState<(typeof filters)[number]>('All services')
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
    if (filter === 'All services') return allServices
    return allServices.filter((service) =>
      service.serviceTypes.some((type) =>
        type.toLowerCase().includes(filter.toLowerCase()),
      ),
    )
  }, [allServices, filter])
  const fixtureQuery = fixture ? `?fixture=${encodeURIComponent(fixture)}` : ''

  return (
    <section className="content-page" aria-labelledby="support-title">
      <div className="connectivity-strip"><CloudSlash aria-hidden="true" size={21} /><span><strong>{isOnline ? (data?.metadata.cachedAt ? 'Saved for offline use' : offline.supportSaved ? 'Preparing offline copy' : 'Online — not saved for offline use') : isSavedCopy ? 'You are offline — showing saved copy' : 'You are offline'}</strong><small>{canReadRecords ? `Showing ${isSavedCopy ? 'saved' : isFixture ? 'test fixture' : 'current'} information near ${postcode}. ${data?.metadata.cachedAt ? `Saved on this device: ${formatSavedDate(data.metadata.cachedAt)}.` : ''}` : noOfflineCopy ? 'No Support information is saved for this postcode.' : 'Loading Support information…'}</small></span></div>
      <div className="page-heading"><div><h1 id="support-title">Nearby support services</h1><p>Find assistance closest to you.</p></div>{isFixture ? <PrototypeBadge /> : null}</div>
      {data && allServices.length > 0 ? <div className="filter-row" aria-label="Filter support services">
        {filters.map((item) => <button aria-pressed={filter === item} className={filter === item ? 'filter-chip is-active' : 'filter-chip'} key={item} type="button" onClick={() => setFilter(item)}>{item}</button>)}
      </div> : null}
      {isLoading ? <LoadingState /> : null}
      {error && !noOfflineCopy ? <div className="error-state" role="alert"><p>{error}</p><button className="button button--quiet" type="button" onClick={retry}>Try again</button></div> : null}
      {noOfflineCopy ? <EmptyState title="No saved support information available offline" action={<Link className="button button--primary" to={appRoutes.offlineInformation}>Choose offline information</Link>}><p>Connect to the internet and download Support information before the next disruption.</p></EmptyState> : null}
      {data?.metadata.refreshError ? <StatusBanner title="Couldn’t update — showing your saved copy" tone="warning"><p>{data.metadata.refreshError} Saved on this device: {formatSavedDate(data.metadata.cachedAt)}.</p></StatusBanner> : null}
      {data?.metadata.freshnessStatus === 'stale' && canReadRecords && !data.metadata.refreshError ? <StatusBanner title="This saved support information may be out of date" tone="warning"><p>Saved copy: {formatSavedDate(data.metadata.cachedAt ?? data.metadata.generatedAt)}. Reconnect and <Link to={appRoutes.offlineInformation}>update saved information</Link> before relying on service details.</p></StatusBanner> : null}
      {data && canReadRecords ? <SupportDatasetDisclosure metadata={data.metadata} /> : null}
      {data && canReadRecords && allServices.length === 0 ? <EmptyState title="No nearby support services are listed" action={<Link className="button button--quiet" to={appRoutes.editProfile}>Check your postcode</Link>}><p>No support services in the current dataset match postcode {postcode}.</p><p>This does not confirm that help is unavailable. The dataset may be incomplete or out of date.</p></EmptyState> : null}
      {data && canReadRecords && allServices.length > 0 ? (
        <div className="service-list">
          {services.map((service) => {
            const availability = getAvailabilityPresentation(service)
            return (
              <article className="service-card" key={service.id}>
                <div className="service-card__heading"><span className="record-row__icon"><HandHeart aria-hidden="true" size={25} weight="duotone" /></span><div><h2>{service.name}</h2><p><MapPin aria-hidden="true" size={17} /> {service.address ? formatServiceAddress(service) : `${service.suburb} VIC ${service.postcode} · Street address not confirmed`} · {service.distanceKm === undefined ? 'Distance not confirmed' : `${service.distanceKm} km`}</p><p><Phone aria-hidden="true" size={17} /> {service.phone ?? 'Phone not published'}{service.website ? <> · <a className="service-contact-link" href={service.website} target="_blank" rel="noreferrer"><LinkSimple aria-hidden="true" size={15} /> Website</a></> : null}</p></div></div>
                <div className="service-tags">{service.serviceTypes.map((type) => <span key={type}>{type}</span>)}</div>
                <div className={`availability availability--${availability.tone}`}>
                  <AvailabilityIcon tone={availability.tone} />
                  <span><strong>{availability.title}</strong><small>{availability.detail}</small></span>
                </div>
                <Link className="service-card__link" to={`${appRoutes.supportDetail(service.id)}${fixtureQuery}`}>View service details <ArrowRight aria-hidden="true" size={19} weight="bold" /></Link>
              </article>
            )
          })}
          {!services.length ? <p className="empty-filter" role="status">No services match this filter. Try another category.</p> : null}
        </div>
      ) : null}
    </section>
  )
}
