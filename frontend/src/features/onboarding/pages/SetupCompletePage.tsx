import { ShieldCheck } from '@phosphor-icons/react'
import { useEffect } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { refreshSupportAreaCache } from '../../../data/offline/supportAreaCache'
import { useSupportAreaCache } from '../../../data/offline/useSupportAreaCache'
import { LocalOnlyNote } from '../../../shared/components/LocalOnlyNote'
import { getMyArea } from '../../../storage/myAreaStorage'
import { getHouseholdProfile } from '../../../storage/onboardingDraftStorage'
import { SupportCacheStatus } from '../../saved-places/components/SupportCacheStatus'

export function SetupCompletePage() {
  const profile = getHouseholdProfile()
  const myArea = getMyArea()
  const supportCache = useSupportAreaCache()
  const hasProfile = Boolean(profile)

  useEffect(() => {
    if (hasProfile) void refreshSupportAreaCache()
  }, [hasProfile])

  if (!profile) return <Navigate replace to={appRoutes.setup} />
  return (
    <section className="flow-page setup-complete" aria-labelledby="complete-title">
      <div className="success-symbol"><ShieldCheck aria-hidden="true" size={44} weight="duotone" /></div>
      <h1 id="complete-title">ShieldAhead is ready</h1>
      <p className="lead">Your household notes and choices are saved on this device.</p>
      <div className="summary-card"><span>My area</span><strong>{myArea?.label ?? 'Not set'}</strong><SupportCacheStatus state={supportCache} /></div>
      <LocalOnlyNote variant="postcode" />
      <div className="flow-actions flow-actions--stacked">
        <Link className="button button--primary" to={appRoutes.home}>Go to home</Link>
        <Link className="button button--quiet" to={appRoutes.offlineInformation}>Choose offline information</Link>
      </div>
    </section>
  )
}
