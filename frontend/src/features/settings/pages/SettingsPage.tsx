import { ArrowRight, Database, MapPin, ShieldCheck, Trash, UserCircle } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { householdCategories } from '../../onboarding/householdCategories'
import { getMyArea } from '../../../storage/myAreaStorage'
import { getConsentState, getHouseholdProfile, getOfflinePreferences } from '../../../storage/onboardingDraftStorage'

export function SettingsPage() {
  const profile = getHouseholdProfile()
  const consent = getConsentState()
  const offline = getOfflinePreferences()
  const myArea = getMyArea()
  const allowedConsentCount = consent
    ? householdCategories.filter(([id]) => consent.optionalCategories[id]).length
    : 0

  return (
    <section className="content-page profile-page" aria-labelledby="settings-title">
      <div className="page-heading"><div><h1 id="settings-title">Your information</h1><p>Manage the details and settings stored on this device.</p></div></div>
      <section className="settings-group" aria-labelledby="my-area-title"><h2 id="my-area-title">My area</h2>
        <Link className="settings-row" to={appRoutes.myArea}><MapPin aria-hidden="true" size={22} /><span><strong>{myArea ? myArea.label : 'Not set'}</strong><small>{myArea ? 'Your crisis pack is built for this area. Tap to change.' : 'Choose the area your crisis pack is built for.'}</small></span><ArrowRight aria-hidden="true" size={19} /></Link>
      </section>
      {profile ? (
        <>
          <section className="profile-card" aria-labelledby="household-summary-title">
            <div className="profile-card__heading"><UserCircle aria-hidden="true" size={28} weight="duotone" /><h2 id="household-summary-title">Household notes</h2></div>
            <dl className="profile-grid">
              <div><dt>Children</dt><dd>{profile.childrenUnder15 ?? 'Not provided'}</dd></div>
              <div><dt>Pets</dt><dd>{profile.hasPets === undefined ? 'Not provided' : profile.hasPets ? 'Yes' : 'No'}</dd></div>
              <div><dt>Health</dt><dd>{profile.healthNeeds?.join(', ') || 'Not provided'}</dd></div>
              <div><dt>Accessibility</dt><dd>{profile.accessibilityNeeds?.join(', ') || 'Not provided'}</dd></div>
            </dl>
            <Link className="button button--accent-outline" to={appRoutes.editProfile}>Edit details</Link>
          </section>
          <section className="settings-group" aria-labelledby="stored-data-title"><h2 id="stored-data-title">Stored data</h2>
            <Link className="settings-row" to={appRoutes.offlineInformation}><Database aria-hidden="true" size={22} /><span><strong>Offline information</strong><small>{offline.wifiSaved || offline.supportSaved ? 'Wi-Fi and support records are available' : 'No public information selected'}</small></span><ArrowRight aria-hidden="true" size={19} /></Link>
            <Link className="settings-row" to={appRoutes.consentSettings}><ShieldCheck aria-hidden="true" size={22} /><span><strong>Consent choices</strong><small>{consent ? `${allowedConsentCount} of ${householdCategories.length} optional categories allowed` : 'No choices saved'}</small></span><ArrowRight aria-hidden="true" size={19} /></Link>
            <div className="settings-row settings-row--static"><MapPin aria-hidden="true" size={22} /><span><strong>Location use</strong><small>My area postcode. Live location only when you ask, and it stays on this device</small></span></div>
          </section>
        </>
      ) : (
        <div className="empty-profile"><UserCircle aria-hidden="true" size={48} weight="duotone" /><h2>No household notes saved</h2><p>Set My area and add optional notes about your household. They stay on this device.</p><Link className="button button--primary" to={appRoutes.setup}>Set up my household</Link></div>
      )}
      <section className="danger-link-section"><h2>Delete everything saved on this device</h2><p>This permanently removes your household notes, My area, crisis pack, checklist ticks, saved routes and downloaded information from this device.</p><Link className="button button--danger-outline" to={appRoutes.deleteProfile}><Trash aria-hidden="true" size={19} /> Delete everything saved on this device</Link></section>
    </section>
  )
}
