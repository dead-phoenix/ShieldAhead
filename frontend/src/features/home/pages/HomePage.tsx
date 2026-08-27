import { Link } from 'react-router-dom'
import { appRoutes, productConfig } from '../../../app/config/product'
import { StatusBanner } from '../../../shared/components/StatusBanner'
import { getOnboardingDraft } from '../../../storage/onboardingDraftStorage'

export function HomePage() {
  const hasSetupDraft = Boolean(getOnboardingDraft())

  return (
    <>
      <section className="home-intro">
        <div>
          <h1>Keep local help within reach</h1>
          <p className="lead">
            Prepare Wi-Fi and support information while connected, so you can
            still read it when your connection drops.
          </p>
          <div className="action-row">
            <Link className="button button--primary" to={appRoutes.setup}>
              {hasSetupDraft ? 'Continue device setup' : 'Set up this device'}
            </Link>
            <span className="privacy-note">
              No account. Household details stay on this device.
            </span>
          </div>
        </div>

        <dl className="prepared-list" aria-label="Preparation status">
          <div>
            <dt>Household setup</dt>
            <dd>{hasSetupDraft ? 'Started' : 'Not started'}</dd>
          </div>
          <div>
            <dt>Local information</dt>
            <dd>Not downloaded</dd>
          </div>
          <div>
            <dt>Region</dt>
            <dd>{productConfig.region}</dd>
          </div>
        </dl>
      </section>

      <StatusBanner title="Prototype data only" tone="warning">
        <p>
          No verified Wi-Fi or support-service locations are loaded yet. The
          current screens establish the frontend structure without presenting
          sample information as real.
        </p>
      </StatusBanner>

      <section className="destination-list" aria-labelledby="prepare-heading">
        <div className="section-heading">
          <h2 id="prepare-heading">What you can prepare</h2>
          <p>Each area will show when its saved information was last updated.</p>
        </div>

        <Link className="destination-row" to={appRoutes.wifi}>
          <span>
            <strong>Nearby Wi-Fi</strong>
            <small>Find saved connection locations when offline</small>
          </span>
          <span aria-hidden="true">View</span>
        </Link>

        <Link className="destination-row" to={appRoutes.support}>
          <span>
            <strong>Local support services</strong>
            <small>Check eligibility, contact details and data freshness</small>
          </span>
          <span aria-hidden="true">View</span>
        </Link>
      </section>
    </>
  )
}
