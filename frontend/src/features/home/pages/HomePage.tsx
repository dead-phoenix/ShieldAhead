import { ArrowRight, CloudCheck, CloudSlash, HandHeart, MapPin, PencilSimple, WifiHigh } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { useOfflineDatasetSummaries } from '../../../data/offline/useOfflineDatasetSummaries'
import { useOnlineStatus } from '../../../shared/hooks/useOnlineStatus'
import { formatSavedDate } from '../../../shared/utils/formatDate'
import { getHouseholdProfile, getOfflinePreferences } from '../../../storage/onboardingDraftStorage'

export function HomePage() {
  const isOnline = useOnlineStatus()
  const profile = getHouseholdProfile()
  const offline = getOfflinePreferences()
  const postcode = profile?.postcode ?? '3453'
  const { summaries, isLoading } = useOfflineDatasetSummaries(postcode)
  const selectedSections = [offline.wifiSaved && 'Wi-Fi', offline.supportSaved && 'Support'].filter(Boolean)
  const savedSections = [offline.wifiSaved && summaries.wifi && 'Wi-Fi', offline.supportSaved && summaries.support && 'Support'].filter(Boolean)
  const hasSavedInformation = savedSections.length > 0
  const needsDownload = !isLoading && selectedSections.length > savedSections.length
  const latestSavedAt = [summaries.wifi?.savedAt, summaries.support?.savedAt]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1)
  const statusTitle = isLoading
    ? 'Checking offline information'
    : hasSavedInformation
      ? (isOnline ? 'Ready offline' : 'You are offline')
      : selectedSections.length
        ? 'Download offline information'
        : 'Choose offline information'

  return (
    <div className="dashboard-page">
      <section className={hasSavedInformation ? 'offline-status-card' : 'offline-status-card offline-status-card--empty'} aria-labelledby="offline-status-title">
        <div className="status-card__heading">
          {hasSavedInformation ? <CloudCheck aria-hidden="true" size={25} weight="duotone" /> : <CloudSlash aria-hidden="true" size={25} weight="duotone" />}
          <div><h1 id="offline-status-title">{statusTitle}</h1><p>{isLoading ? 'Checking what is stored on this device.' : hasSavedInformation ? `${savedSections.join(' and ')} information is available without a connection.` : selectedSections.length ? 'Your selection has not been downloaded to this device yet.' : 'No public information is currently selected for offline use.'}</p></div>
        </div>
        <dl>
          <div><dt>Saved copy</dt><dd>{isLoading ? 'Checking…' : formatSavedDate(latestSavedAt)}</dd></div>
          <div><dt>Saved sections</dt><dd>{savedSections.join(' and ') || 'None'}</dd></div>
        </dl>
        <div className="status-card__footer">
          {(!hasSavedInformation || needsDownload) && !isLoading ? <Link className="button button--primary button--compact status-card__link" to={appRoutes.offlineInformation}>{selectedSections.length ? 'Download selected information' : 'Choose what to save'} <ArrowRight aria-hidden="true" size={16} weight="bold" /></Link> : null}
        </div>
      </section>

      {!profile ? (
        <section className="setup-prompt">
          <div><h2>Make results more relevant</h2><p>Add a postcode and optional household details. No account is required.</p></div>
          <Link className="button button--primary" to={appRoutes.setup}>Set up this device</Link>
        </section>
      ) : null}

      <section className="home-actions" aria-label="Prepared information">
        <Link className="action-tile action-tile--wifi" to={appRoutes.wifi}>
          <span className="action-tile__icon"><WifiHigh aria-hidden="true" size={28} weight="duotone" /></span>
          <span><strong>Find free Wi-Fi</strong><small>View saved places near {postcode}</small></span>
          <ArrowRight aria-hidden="true" size={22} weight="bold" />
        </Link>
        <Link className="action-tile action-tile--support" to={appRoutes.support}>
          <span className="action-tile__icon"><HandHeart aria-hidden="true" size={28} weight="duotone" /></span>
          <span><strong>Find local support</strong><small>Food, health, transport and more</small></span>
          <ArrowRight aria-hidden="true" size={22} weight="bold" />
        </Link>
      </section>

      <section className="saved-profile" aria-labelledby="saved-profile-title">
        <div className="section-heading"><div><h2 id="saved-profile-title">Saved on this device</h2><p>Private profile information is never shown as public data.</p></div><Link to={appRoutes.settings}>Manage</Link></div>
        <div className="profile-summary-row"><MapPin aria-hidden="true" size={24} weight="duotone" /><span><small>Primary area</small><strong>{postcode === '3453' ? 'Harcourt 3453' : `Postcode ${postcode}`}</strong></span><Link aria-label="Edit profile" to={profile ? appRoutes.settings : appRoutes.setup}><PencilSimple aria-hidden="true" size={20} /></Link></div>
      </section>
    </div>
  )
}
