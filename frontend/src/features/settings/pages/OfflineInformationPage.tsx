import { CheckCircle, Database, Trash, WifiHigh } from '@phosphor-icons/react'
import { useState } from 'react'
import { appRoutes } from '../../../app/config/product'
import { PageBackLink } from '../../../shared/components/PageBackLink'
import { PrototypeBadge } from '../../../shared/components/PrototypeBadge'
import { getOfflinePreferences, saveOfflinePreferences } from '../../../storage/onboardingDraftStorage'

export function OfflineInformationPage() {
  const [preferences, setPreferences] = useState(getOfflinePreferences)
  const [message, setMessage] = useState('')

  function update(next: typeof preferences, messageText: string) {
    saveOfflinePreferences(next)
    setPreferences(next)
    setMessage(messageText)
  }

  function refreshInformation() {
    update({ ...preferences, lastUpdatedAt: new Date().toISOString() }, 'Saved example information updated for this prototype.')
  }

  return (
    <section className="content-page" aria-labelledby="offline-title">
      <PageBackLink to={appRoutes.settings}>Back to profile</PageBackLink>
      <div className="page-heading"><div><h1 id="offline-title">Offline information</h1><p>Choose which public example records remain on this device.</p></div></div>
      <div className="offline-ready"><CheckCircle aria-hidden="true" size={26} weight="fill" /><span><strong>Ready offline</strong><small>Selected information is saved on this device.</small></span></div>
      <div className="offline-dataset-list">
        <label className="offline-dataset"><span className="record-row__icon"><WifiHigh aria-hidden="true" size={24} /></span><span><strong>Wi-Fi places near Harcourt 3453</strong><small>2 example places</small><PrototypeBadge /></span><input type="checkbox" checked={preferences.wifiSaved} onChange={(event) => update({ ...preferences, wifiSaved: event.target.checked }, event.target.checked ? 'Wi-Fi information selected.' : 'Wi-Fi information removed from offline selection.')} /></label>
        <label className="offline-dataset"><span className="record-row__icon"><Database aria-hidden="true" size={24} /></span><span><strong>Support services near Harcourt 3453</strong><small>2 example services</small><PrototypeBadge /></span><input type="checkbox" checked={preferences.supportSaved} onChange={(event) => update({ ...preferences, supportSaved: event.target.checked }, event.target.checked ? 'Support information selected.' : 'Support information removed from offline selection.')} /></label>
      </div>
      {message ? <p className="inline-status" role="status" aria-live="polite">{message}</p> : null}
      <div className="detail-actions">
        <button className="button button--primary" type="button" onClick={refreshInformation}>Update saved information</button>
        <button className="button button--danger-outline" type="button" onClick={() => update({ wifiSaved: false, supportSaved: false }, 'Downloaded public information removed from this device.')}><Trash aria-hidden="true" size={19} /> Remove downloaded information</button>
      </div>
      <p className="data-footnote">Your private profile and consent choices are managed separately in Profile.</p>
    </section>
  )
}
