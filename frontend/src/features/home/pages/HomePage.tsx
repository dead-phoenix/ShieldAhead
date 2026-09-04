import { ArrowRight, HandHeart, WifiHigh } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { appRoutes, productConfig } from '../../../app/config/product'

export function HomePage() {
  return (
    <div className="landing-page">
      <section className="landing-about" aria-labelledby="about-title">
        <h1 id="about-title">About {productConfig.name}</h1>
        <p className="landing-about__copy">
          ShieldAhead helps households in Victoria get ready before disaster strikes — not after.
          We’re not a crisis directory. We’re here earlier — helping you prepare, quietly and
          privately, on your own terms. ShieldAhead brings together essential relief, emergency
          information and local Wi-Fi in one place — all stored securely on your device, so it
          works even when the network doesn’t.
        </p>
      </section>

      <section className="landing-features" aria-label="Find nearby information">
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
          It is not available in this version, and it will not contact emergency services.
        </p>
      </section>
    </div>
  )
}
