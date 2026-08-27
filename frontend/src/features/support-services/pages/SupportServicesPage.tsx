import { Link } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { EmptyState } from '../../../shared/components/EmptyState'
import { StatusBanner } from '../../../shared/components/StatusBanner'

export function SupportServicesPage() {
  return (
    <section className="content-page" aria-labelledby="support-title">
      <h1 id="support-title">Local support services</h1>
      <p className="lead">
        Service details will show eligibility, contact information, limitations
        and when each record was last checked.
      </p>

      <StatusBanner title="Availability is not live" tone="warning">
        <p>
          No production service dataset is connected. The app will never imply
          that supplies or appointments are guaranteed.
        </p>
      </StatusBanner>

      <EmptyState
        title="No verified services to show"
        action={
          <Link className="button button--quiet" to={appRoutes.home}>
            Return home
          </Link>
        }
      >
        <p>
          Once the data team supplies reviewed records, the repository adapter
          will populate this page without changing its components.
        </p>
      </EmptyState>
    </section>
  )
}
