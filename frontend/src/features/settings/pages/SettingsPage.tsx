import { ArrowRight, Database, MapPin, ShieldCheck, Trash, UserCircle } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { getConsentState, getHouseholdProfile, getOfflinePreferences } from '../../../storage/onboardingDraftStorage'

export function SettingsPage() {
  const profile = getHouseholdProfile()
  const consent = getConsentState()
  const offline = getOfflinePreferences()
  const allowedConsentCount = consent
    ? Object.values(consent.optionalCategories).filter(Boolean).length
    : 0

  return (
    <section className="content-page profile-page" aria-labelledby="settings-title">
      <div className="page-heading"><div><h1 id="settings-title">Your information</h1><p>Manage the details and settings stored on this device.</p></div></div>
      {profile ? (
        <>
          <section className="profile-card" aria-labelledby="household-summary-title">
            <div className="profile-card__heading"><UserCircle aria-hidden="true" size={28} weight="duotone" /><h2 id="household-summary-title">Household summary</h2></div>
            <dl className="profile-grid">
              <div><dt>Name</dt><dd>{profile.name || 'Not provided'}</dd></div>
              <div><dt>Postcode</dt><dd>{profile.postcode === '3453' ? 'Harcourt 3453' : profile.postcode}</dd></div>
              <div><dt>Household</dt><dd>{profile.householdSize ?? 'Not provided'}</dd></div>
              <div><dt>Children</dt><dd>{profile.childrenUnder15 ?? 'Not provided'}</dd></div>
              <div><dt>Health</dt><dd>{profile.healthNeeds?.join(', ') || 'Not provided'}</dd></div>
              <div><dt>Accessibility</dt><dd>{profile.accessibilityNeeds?.join(', ') || 'Not provided'}</dd></div>
            </dl>
            <Link className="button button--quiet" to={appRoutes.editProfile}>Edit details</Link>
          </section>
          <section className="settings-group" aria-labelledby="stored-data-title"><h2 id="stored-data-title">Stored data</h2>
            <Link className="settings-row" to={appRoutes.offlineInformation}><Database aria-hidden="true" size={22} /><span><strong>Offline information</strong><small>{offline.wifiSaved || offline.supportSaved ? 'Wi-Fi and support records are available' : 'No public information selected'}</small></span><ArrowRight aria-hidden="true" size={19} /></Link>
            <Link className="settings-row" to={appRoutes.consentSettings}><ShieldCheck aria-hidden="true" size={22} /><span><strong>Consent choices</strong><small>{consent ? `${allowedConsentCount} of 3 optional categories allowed` : 'No choices saved'}</small></span><ArrowRight aria-hidden="true" size={19} /></Link>
            <div className="settings-row settings-row--static"><MapPin aria-hidden="true" size={22} /><span><strong>Location use</strong><small>Postcode only — no live location access</small></span></div>
          </section>
          <section className="danger-link-section"><h2>Delete your information</h2><p>This permanently removes your private profile and choices from this device.</p><Link className="button button--danger-outline" to={appRoutes.deleteProfile}><Trash aria-hidden="true" size={19} /> Delete profile and choices</Link></section>
        </>
      ) : (
        <div className="empty-profile"><UserCircle aria-hidden="true" size={48} weight="duotone" /><h2>No household profile saved</h2><p>You can still use example public information without creating an account.</p><Link className="button button--primary" to={appRoutes.setup}>Set up this device</Link></div>
      )}
    </section>
  )
}
