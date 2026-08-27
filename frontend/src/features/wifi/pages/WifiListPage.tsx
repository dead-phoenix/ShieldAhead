import { Link } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { EmptyState } from '../../../shared/components/EmptyState'
import { StatusBanner } from '../../../shared/components/StatusBanner'

export function WifiListPage() {
  return (
    <section className="content-page" aria-labelledby="wifi-title">
      <h1 id="wifi-title">Nearby Wi-Fi</h1>
      <p className="lead">
        Saved locations will remain readable here when your connection is
        unavailable.
      </p>

      <StatusBanner title="No verified dataset connected" tone="warning">
        <p>The frontend adapter is ready, but no real Wi-Fi records are loaded.</p>
      </StatusBanner>

      <EmptyState
        title="No Wi-Fi locations to show"
        action={
          <Link className="button button--quiet" to={appRoutes.home}>
            Return home
          </Link>
        }
      >
        <p>
          This state prevents unverified placeholder locations from looking like
          real public services.
        </p>
      </EmptyState>
    </section>
  )
}
