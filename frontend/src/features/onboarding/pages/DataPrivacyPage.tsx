import { ArrowLeft, CloudSlash, DeviceMobile, LockKey, SlidersHorizontal, UserCircle } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { LocalOnlyNote } from '../../../shared/components/LocalOnlyNote'

const privacyPoints = [
  {
    icon: CloudSlash,
    title: 'Your household notes stay on this device',
    copy: 'There is nothing to register, and your household notes are never uploaded.',
  },
  {
    icon: UserCircle,
    title: 'Only My area is required',
    copy: 'A postcode lets us look up nearby places without knowing your exact location.',
  },
  {
    icon: SlidersHorizontal,
    title: 'You are in control',
    copy: 'Every optional category can be skipped or declined without blocking setup.',
  },
  {
    icon: DeviceMobile,
    title: 'What stays on this device',
    copy: 'My area, household notes, your crisis pack, checklist ticks, the nearby services list, the 20 nearest support services for My area, and places you save with the heart. Delete everything in Profile removes them all.',
  },
]

export function DataPrivacyPage() {
  return (
    <section className="flow-page privacy-intro" aria-labelledby="privacy-title">
      <div className="privacy-symbol" aria-hidden="true">
        <LockKey size={34} weight="duotone" />
      </div>
      <h1 id="privacy-title">Your Privacy Matters</h1>
      <p className="lead">ShieldAhead is designed to be useful without tracking you. Your household details stay here.</p>
      <div className="benefit-list privacy-point-list">
        {privacyPoints.map((point) => {
          const Icon = point.icon
          return (
            <div className="benefit-row" key={point.title}>
              <span className="benefit-row__icon"><Icon aria-hidden="true" size={20} /></span>
              <span><strong>{point.title}</strong><small>{point.copy}</small></span>
            </div>
          )
        })}
      </div>
      <LocalOnlyNote variant="postcode" />
      <div className="flow-actions flow-actions--stacked">
        <Link className="button button--primary" to={appRoutes.householdNeeds}>Continue</Link>
        <Link className="button button--quiet" to={appRoutes.setup}><ArrowLeft aria-hidden="true" size={18} /> Back</Link>
      </div>
    </section>
  )
}
