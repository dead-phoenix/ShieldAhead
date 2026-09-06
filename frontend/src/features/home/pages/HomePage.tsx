import { useEffect, useState } from 'react'
import { ArrowDown, ArrowRight, CloudSlash, HandHeart, LockKey, MapPin, ShieldCheck, WifiHigh } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import {
  bundledCoverageStats,
  loadCoverageStats,
} from '../../../data/coverage/coverageStats'
import { GetTheAppButton } from '../../../shared/components/GetTheAppButton'

function formatCount(value: number): string {
  return value.toLocaleString('en-AU')
}

export function HomePage() {
  const [stats, setStats] = useState(bundledCoverageStats)

  useEffect(() => {
    void loadCoverageStats().then(setStats)
  }, [])

  return (
    <div className="landing-page landing-page--focused">
      <section className="landing-about" aria-labelledby="about-title">
        <div className="landing-hero">
          <div className="landing-hero__message">
            <h1 id="about-title">
              Local help.
              <br />
              <span className="landing-about__accent">Within reach.</span>
            </h1>
            <p className="landing-about__copy">
              Find nearby support and free Wi-Fi. Save local information on your device for when the network goes down.
            </p>
          </div>

          <div className="landing-hero__visual" aria-hidden="true">
            <span className="landing-hero__orbit landing-hero__orbit--outer" />
            <span className="landing-hero__orbit landing-hero__orbit--inner" />
            <span className="landing-hero__node landing-hero__node--support"><HandHeart weight="duotone" /></span>
            <span className="landing-hero__node landing-hero__node--wifi"><WifiHigh weight="duotone" /></span>
            <span className="landing-hero__node landing-hero__node--location"><MapPin weight="duotone" /></span>
            <div className="landing-hero__device">
              <span className="landing-hero__device-mark"><ShieldCheck weight="duotone" /></span>
              <span className="landing-hero__device-line landing-hero__device-line--strong" />
              <span className="landing-hero__device-line" />
              <span className="landing-hero__device-status">Ready offline</span>
            </div>
          </div>
        </div>
        <div className="landing-about__actions">
          <Link className="button landing-action landing-action--primary" to={appRoutes.location}>
            <MapPin aria-hidden="true" size={19} weight="fill" />
            <span>Find what’s near you</span>
            <ArrowRight aria-hidden="true" size={17} weight="bold" />
          </Link>
          <a className="button landing-action landing-action--secondary" href="#how-it-works">
            <span>See how it works</span>
            <ArrowDown aria-hidden="true" size={17} weight="bold" />
          </a>
        </div>
        <dl className="landing-stats">
          <div>
            <dt>Wi-Fi locations</dt>
            <dd>{formatCount(stats.wifiLocations)}</dd>
          </div>
          <div>
            <dt>Support services</dt>
            <dd>{formatCount(stats.supportServices)}</dd>
          </div>
          <div>
            <dt>Coverage</dt>
            <dd>{stats.coverage}</dd>
          </div>
        </dl>
        <ul className="landing-values">
          <li className="landing-value landing-value--accent">
            <ShieldCheck aria-hidden="true" size={22} weight="regular" />
            <p><strong>Prevention, not crisis response</strong></p>
          </li>
          <li className="landing-value landing-value--sand">
            <CloudSlash aria-hidden="true" size={22} weight="regular" />
            <p><strong>Works even offline</strong></p>
          </li>
          <li className="landing-value landing-value--ink">
            <LockKey aria-hidden="true" size={22} weight="regular" />
            <p><strong>Private by default, on your device</strong></p>
          </li>
        </ul>
      </section>

      <section className="landing-features" id="how-it-works" aria-label="Find nearby information">
        <p className="landing-features__intro">Here’s what you can do</p>
        <div className="landing-features__card">
          <article className="landing-feature">
            <span className="landing-icon-tile" aria-hidden="true">
              <HandHeart size={22} weight="regular" />
            </span>
            <h2>Find local support</h2>
            <p>Food, health, transport and other nearby services listed for your area.</p>
            <Link className="landing-feature__link" to={appRoutes.support}>
              Open support list <ArrowRight aria-hidden="true" size={16} weight="bold" />
            </Link>
          </article>
          <article className="landing-feature">
            <span className="landing-icon-tile" aria-hidden="true">
              <WifiHigh size={22} weight="regular" />
            </span>
            <h2>Find free Wi-Fi</h2>
            <p>Public Wi-Fi places in your area, with confirmed and likely listings kept distinct.</p>
            <Link className="landing-feature__link" to={appRoutes.wifi}>
              Open Wi-Fi list <ArrowRight aria-hidden="true" size={16} weight="bold" />
            </Link>
          </article>
        </div>
      </section>

      <section className="landing-pack" aria-labelledby="crisis-pack-title">
        <p className="landing-tag landing-tag--later">Coming later</p>
        <h2 id="crisis-pack-title">Crisis Pack</h2>
        <p>
          The Crisis Pack will be a private, on-device checklist for later iterations: household
          contacts, medication notes, and a short list of things to take if you need to leave.
          It is not available in this version.
        </p>
      </section>

      <div className="landing-install">
        <GetTheAppButton variant="footer" />
      </div>
    </div>
  )
}
