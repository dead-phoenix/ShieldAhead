import { Trash, Warning } from '@phosphor-icons/react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { PageBackLink } from '../../../shared/components/PageBackLink'
import { clearProfileAndChoices } from '../../../storage/onboardingDraftStorage'

export function DeleteProfilePage() {
  const [removeOffline, setRemoveOffline] = useState(false)
  const [deleted, setDeleted] = useState(false)
  if (deleted) {
    return <section className="flow-page setup-complete" aria-labelledby="deleted-title"><div className="success-symbol"><Trash aria-hidden="true" size={38} weight="duotone" /></div><h1 id="deleted-title">Profile and choices deleted</h1><p className="lead">Your private household information has been removed from this device.</p><Link className="button button--primary" to={appRoutes.home}>Return home</Link></section>
  }
  return (
    <section className="flow-page delete-page" aria-labelledby="delete-title">
      <PageBackLink to={appRoutes.settings}>Cancel and return to profile</PageBackLink>
      <h1 id="delete-title">Delete profile and choices?</h1>
      <div className="delete-explanation"><Warning aria-hidden="true" size={24} /><p>This permanently removes your household profile, consent choices and saved preferences from this device. This cannot be undone.</p></div>
      <label className="check-card"><input type="checkbox" checked={removeOffline} onChange={(event) => setRemoveOffline(event.target.checked)} /><span><strong>Also remove downloaded public information</strong><small>If left unchecked, saved Wi-Fi and support information remains available offline.</small></span></label>
      <div className="detail-actions detail-actions--bottom"><button className="button button--danger" type="button" onClick={() => { clearProfileAndChoices(removeOffline); setDeleted(true) }}><Trash aria-hidden="true" size={19} /> Delete profile and choices</button><Link className="button button--quiet" to={appRoutes.settings}>Cancel</Link></div>
    </section>
  )
}
