import { useEffect, useRef, useState } from 'react'
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
  const pageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void loadCoverageStats().then(setStats)
  }, [])

  useEffect(() => {
    const page = pageRef.current
    if (!page) return

    const revealItems = Array.from(page.querySelectorAll<HTMLElement>('[data-scroll-reveal]'))
    if (!('IntersectionObserver' in window)) {
      revealItems.forEach((item) => item.setAttribute('data-revealed', 'true'))
      return
    }

    page.setAttribute('data-reveal-ready', 'true')
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          entry.target.setAttribute('data-revealed', 'true')
          observer.unobserve(entry.target)
        })
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.12 },
    )

    revealItems.forEach((item) => observer.observe(item))
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={pageRef} className="landing-page landing-page--focused">
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

      <section className="landing-journey" id="how-it-works" aria-labelledby="journey-title">
        <header className="landing-journey__header" data-scroll-reveal>
          <p>How ShieldAhead works</p>
          <h2 id="journey-title">Prepare once. Know where to turn.</h2>
          <span>Four clear steps take you from setting your area to keeping useful local information available when your connection is not.</span>
        </header>

        <article className="journey-step" data-scroll-reveal>
          <div className="journey-step__copy">
            <p className="journey-step__index">01 / HOUSEHOLD</p>
            <span className="journey-step__signal"><ShieldCheck aria-hidden="true" weight="fill" /> Private setup</span>
            <h3>Prepare your household.</h3>
            <p>Add only what you are comfortable sharing. Your postcode helps ShieldAhead prepare information for your area, while your profile stays on this device.</p>
            <Link className="journey-step__action" to={appRoutes.setup}>Set up your profile <ArrowRight aria-hidden="true" weight="bold" /></Link>
          </div>
          <figure className="journey-step__media">
            <img src="/images/household-support.webp" alt="Two people looking at information together on a mobile phone" loading="lazy" />
          </figure>
        </article>

        <article className="journey-step journey-step--reverse" data-scroll-reveal>
          <div className="journey-step__copy">
            <p className="journey-step__index">02 / LOCAL INFORMATION</p>
            <span className="journey-step__signal"><MapPin aria-hidden="true" weight="fill" /> Based on your area</span>
            <h3>See what is nearby.</h3>
            <p>Use your postcode to explore public Wi-Fi and support services, with the closest available results shown first.</p>
            <Link className="journey-step__action" to={appRoutes.location}>Choose your location <ArrowRight aria-hidden="true" weight="bold" /></Link>
          </div>
          <figure className="journey-step__media">
            <img src="/images/state-library-victoria.webp" alt="The entrance of the State Library Victoria in Melbourne" loading="lazy" />
            <figcaption>Public places can provide a way to reconnect. Always check the listing before travelling.</figcaption>
          </figure>
        </article>

        <article className="journey-step" data-scroll-reveal>
          <div className="journey-step__copy">
            <p className="journey-step__index">03 / CHECK DETAILS</p>
            <span className="journey-step__signal"><HandHeart aria-hidden="true" weight="fill" /> Know before you go</span>
            <h3>Check before travelling.</h3>
            <p>Review distance, address, service type and availability notes before choosing where to go. Unconfirmed information is clearly identified.</p>
            <Link className="journey-step__action" to={appRoutes.support}>Explore local support <ArrowRight aria-hidden="true" weight="bold" /></Link>
          </div>
          <div className="journey-step__media journey-step__media--interface" aria-label="Example support service information">
            <div className="journey-preview">
              <span className="journey-preview__icon"><HandHeart aria-hidden="true" weight="duotone" /></span>
              <p>Community support service</p>
              <strong>Help near your saved area</strong>
              <span><MapPin aria-hidden="true" /> Address and distance shown</span>
              <div><b>Availability not confirmed</b><small>Check the details before travelling.</small></div>
              <span className="journey-preview__link">View service details <ArrowRight aria-hidden="true" /></span>
            </div>
          </div>
        </article>

        <article className="journey-step journey-step--reverse" data-scroll-reveal>
          <div className="journey-step__copy">
            <p className="journey-step__index">04 / OFFLINE ACCESS</p>
            <span className="journey-step__signal"><CloudSlash aria-hidden="true" weight="fill" /> Ready without signal</span>
            <h3>Keep it on your phone.</h3>
            <p>Prepare nearby information while you are online, then read the saved copy if your connection becomes unreliable.</p>
            <Link className="journey-step__action" to={appRoutes.offlineInformation}>Prepare offline information <ArrowRight aria-hidden="true" weight="bold" /></Link>
          </div>
          <figure className="journey-step__media journey-step__media--offline">
            <img src="/images/offline-phone.webp" alt="A person using a mobile phone" loading="lazy" />
            <figcaption><ShieldCheck aria-hidden="true" weight="fill" /><span><strong>Saved on this device</strong><small>Available when the network is not</small></span></figcaption>
          </figure>
        </article>
      </section>

      <section className="landing-pack" aria-labelledby="crisis-pack-title" data-scroll-reveal>
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
