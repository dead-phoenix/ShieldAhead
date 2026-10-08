import { ShieldCheck } from '@phosphor-icons/react'
import { Link, Navigate } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { LocalOnlyNote } from '../../../shared/components/LocalOnlyNote'
import { getMyArea } from '../../../storage/myAreaStorage'
import { getHouseholdProfile } from '../../../storage/onboardingDraftStorage'

export function SetupCompletePage() {
  const profile = getHouseholdProfile()
  const myArea = getMyArea()
  if (!profile) return <Navigate replace to={appRoutes.setup} />
  return (
    <section className="flow-page setup-complete" aria-labelledby="complete-title">
      <div className="success-symbol"><ShieldCheck aria-hidden="true" size={44} weight="duotone" /></div>
      <h1 id="complete-title">ShieldAhead is ready</h1>
      <p className="lead">Your household notes and choices are saved on this device.</p>
      <div className="summary-card"><span>My area</span><strong>{myArea?.label ?? 'Not set'}</strong><p>Offline public information can be managed separately.</p></div>
      <LocalOnlyNote variant="postcode" />
      <div className="flow-actions flow-actions--stacked">
        <Link className="button button--primary" to={appRoutes.home}>Go to home</Link>
        <Link className="button button--quiet" to={appRoutes.offlineInformation}>Choose offline information</Link>
      </div>
    </section>
  )
}
