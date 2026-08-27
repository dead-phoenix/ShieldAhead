import { ArrowRight, CloudSlash, Info, LockKey, ShieldCheck, UserCircle } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'

const setupBenefits = [
  { icon: UserCircle, title: 'No account required', copy: 'Start using the app without signing up.' },
  { icon: LockKey, title: 'Private by default', copy: 'Your household profile and choices stay on this device.' },
  { icon: CloudSlash, title: 'Works offline', copy: 'Saved public information remains available without a connection.' },
]

export function SetupWelcomePage() {
  return (
    <section className="flow-page welcome-page" aria-labelledby="setup-title">
      <div className="welcome-symbol" aria-hidden="true"><ShieldCheck size={36} weight="duotone" /></div>
      <h1 id="setup-title">Know where to go, even when the network is down.</h1>
      <p className="lead">ShieldAhead helps you prepare nearby Wi-Fi and local support information for times when your connection is unreliable.</p>
      <div className="benefit-list">
        {setupBenefits.map((benefit) => {
          const Icon = benefit.icon
          return (
            <div className="benefit-row" key={benefit.title}>
              <span className="benefit-row__icon"><Icon aria-hidden="true" size={22} weight="duotone" /></span>
              <span><strong>{benefit.title}</strong><small>{benefit.copy}</small></span>
            </div>
          )
        })}
      </div>
      <div className="flow-actions flow-actions--stacked">
        <Link className="button button--primary" to={appRoutes.setupPrivacy}>Set up ShieldAhead <ArrowRight aria-hidden="true" size={18} weight="bold" /></Link>
        <Link className="button button--text" to={appRoutes.setupPrivacy}><Info aria-hidden="true" size={17} /> How your information is stored</Link>
      </div>
    </section>
  )
}
