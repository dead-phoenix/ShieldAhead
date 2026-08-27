import { ArrowLeft, CloudSlash, LockKey, SlidersHorizontal, UserCircle } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'

const privacyPoints = [
  {
    icon: CloudSlash,
    title: 'Your profile stays on this device',
    copy: 'No account is created and nothing is uploaded.',
  },
  {
    icon: UserCircle,
    title: 'Only postcode is required',
    copy: 'This allows us to organise local information without knowing your exact location.',
  },
  {
    icon: SlidersHorizontal,
    title: 'You are in control',
    copy: 'Every optional category can be skipped or declined without blocking setup.',
  },
]

export function DataPrivacyPage() {
  return (
    <section className="flow-page privacy-intro" aria-labelledby="privacy-title">
      <div className="privacy-symbol" aria-hidden="true">
        <LockKey size={34} weight="duotone" />
      </div>
      <h1 id="privacy-title">Your Privacy Matters</h1>
      <p className="lead">ShieldAhead is designed to be useful without tracking you. Your data stays here.</p>
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
      <div className="flow-actions flow-actions--stacked">
        <Link className="button button--primary" to={appRoutes.householdBasics}>Continue</Link>
        <Link className="button button--quiet" to={appRoutes.setup}><ArrowLeft aria-hidden="true" size={18} /> Back</Link>
      </div>
    </section>
  )
}
