import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowRight, BookOpenText, CheckSquareOffset, CloudSlash, HandHeart, HouseLine, LockKey, MapPin, ShieldCheck, UsersThree, WifiHigh } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import {
  bundledCoverageStats,
  loadCoverageStats,
} from '../../../data/coverage/coverageStats'
import { GetTheAppButton } from '../../../shared/components/GetTheAppButton'
import { CaseStudyFlipStack } from '@/components/ui/case-study-flip-stack'
import '../../../styles/flip-stack.css'

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
          <img className="landing-hero__bg" src="/images/hero-prepare.jpg" alt="An older woman sitting on a sofa and using a phone" />
          <div className="landing-hero__layout">
            <div className="landing-hero__message">
              <h1 id="about-title">
                Shield Ahead.
                <br />
                Before it happens.
              </h1>
              <p className="landing-about__copy">
                Find nearby support and free Wi-Fi, and save local information to your device now, so it's still there when the network goes down.
              </p>
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
            </div>
            <div className="landing-hero__card" />
          </div>
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

      <section className="landing-overview" aria-labelledby="overview-title">
        <div className="landing-overview__intro" data-scroll-reveal>
          <div>
            <h2 id="overview-title">What is ShieldAhead?</h2>
            <p>ShieldAhead is a preparation and offline-support app for Victorian households. It brings crisis guidance, possible public Wi-Fi and nearby support information together, so useful details are easier to understand before a disruption occurs.</p>
          </div>
          <aside aria-labelledby="why-shieldahead-title">
            <h3 id="why-shieldahead-title">Why ShieldAhead?</h3>
            <ul>
              <li><ShieldCheck aria-hidden="true" weight="fill" /> Prepare before something goes wrong</li>
              <li><HandHeart aria-hidden="true" weight="fill" /> Understand nearby support options</li>
              <li><WifiHigh aria-hidden="true" weight="fill" /> Find possible places to reconnect</li>
              <li><BookOpenText aria-hidden="true" weight="fill" /> Keep important information easier to access</li>
            </ul>
          </aside>
        </div>

        <div className="landing-overview__features" data-scroll-reveal>
          <h3>Our key features</h3>
          <div className="landing-overview__feature-grid">
            <Link className="landing-overview__feature landing-overview__feature--crisis" to={appRoutes.crisis}>
              <span className="landing-overview__feature-icon"><CheckSquareOffset aria-hidden="true" weight="duotone" /></span>
              <strong>Crisis preparation</strong>
              <span>Practical guidance and household checklists for bushfires, floods and extended power outages.</span>
              <small>Progress saved on this device</small>
            </Link>
            <Link className="landing-overview__feature landing-overview__feature--offline" to={appRoutes.offlineInformation}>
              <span className="landing-overview__feature-icon"><CloudSlash aria-hidden="true" weight="duotone" /></span>
              <strong>Offline information</strong>
              <span>Prepare useful Wi-Fi and support information while connected, then read the saved copy offline.</span>
              <small>Available when the network is not</small>
            </Link>
            <Link className="landing-overview__feature landing-overview__feature--wifi" to={`${appRoutes.map}?category=wifi`}>
              <span className="landing-overview__feature-icon"><WifiHigh aria-hidden="true" weight="duotone" /></span>
              <strong>Nearby Wi-Fi</strong>
              <span>Review public Wi-Fi and possible fallback locations before deciding where to travel.</span>
              <small>Check the listing before travelling</small>
            </Link>
            <Link className="landing-overview__feature landing-overview__feature--support" to={`${appRoutes.map}?category=support`}>
              <span className="landing-overview__feature-icon"><UsersThree aria-hidden="true" weight="duotone" /></span>
              <strong>Nearby support</strong>
              <span>Explore food, financial, housing and emergency support details near your selected area.</span>
              <small>Clear service details and limitations</small>
            </Link>
          </div>
        </div>
      </section>

      <section className="landing-journey" id="how-it-works" aria-labelledby="journey-title">
        <CaseStudyFlipStack
          className="bg-transparent"
          heading="Prepare once. Know where to turn."
          items={[
            {
              number: '01',
              eyebrow: 'Household',
              title: 'Prepare your household.',
              description: 'Add only what you are comfortable sharing. Your postcode helps ShieldAhead prepare information for your area, while your profile stays on this device.',
              image: '/images/household-support.webp',
              imageAlt: 'Two people looking at information together on a mobile phone',
              background: '#e5f5ff',
              foreground: '#0b1830',
            },
            {
              number: '02',
              eyebrow: 'Local information',
              title: 'See what is nearby.',
              description: 'Use your postcode to explore public Wi-Fi and support services, with the closest available results shown first. Public places can provide a way to reconnect. Always check the listing before travelling.',
              image: '/images/state-library-victoria.webp',
              imageAlt: 'The entrance of the State Library Victoria in Melbourne',
              background: '#e8e9ff',
              foreground: '#0b1830',
            },
            {
              number: '03',
              eyebrow: 'Check details',
              title: 'Check before travelling.',
              description: 'Review distance, address, service type and availability notes before choosing where to go. Unconfirmed information is clearly identified.',
              image: '/images/support-preview.svg',
              imageAlt: 'Example support service information',
              background: '#fff7da',
              foreground: '#0b1830',
            },
            {
              number: '04',
              eyebrow: 'Offline access',
              title: 'Keep it on your phone.',
              description: 'Prepare nearby information while you are online, then read the saved copy if your connection becomes unreliable.',
              image: '/images/offline-phone.webp',
              imageAlt: 'A person using a mobile phone',
              background: '#e1f4f1',
              foreground: '#0b1830',
            },
          ]}
        />
      </section>

      <section className="landing-trust" aria-label="Privacy and community" data-scroll-reveal>
        <article className="landing-trust__panel" aria-labelledby="landing-privacy-title">
          <span className="landing-trust__icon"><LockKey aria-hidden="true" weight="duotone" /></span>
          <div>
            <h2 id="landing-privacy-title">Your information stays yours.</h2>
            <p>Household details and checklist progress stay on this device. No account is required, and you remain in control of what you save.</p>
          </div>
          <ul aria-label="Privacy benefits">
            <li><ShieldCheck aria-hidden="true" weight="fill" /> Stored locally</li>
            <li><MapPin aria-hidden="true" weight="fill" /> Postcode, not continuous tracking</li>
            <li><LockKey aria-hidden="true" weight="fill" /> Review or remove it any time</li>
          </ul>
        </article>
        <article className="landing-trust__panel landing-trust__panel--community" aria-labelledby="community-title">
          <span className="landing-trust__icon"><UsersThree aria-hidden="true" weight="duotone" /></span>
          <div>
            <h2 id="community-title">Built for households that may need extra support.</h2>
            <p>Designed for older people, families, people with health or accessibility needs, and communities using slower or less reliable connections.</p>
          </div>
          <span className="landing-trust__community-line"><HouseLine aria-hidden="true" weight="duotone" /> Prepared households. Stronger communities.</span>
        </article>
      </section>

      <div className="landing-install">
        <GetTheAppButton variant="footer" />
      </div>
    </div>
  )
}
