import { Link } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { EmptyState } from '../../../shared/components/EmptyState'

/** Shown instead of a retry when a place is not saved and there is no connection. */
export function OfflinePlaceUnavailable() {
  return (
    <EmptyState
      title="This place isn't saved on this device"
      action={(
        <div className="flow-actions flow-actions--stacked">
          <Link className="button button--primary" to={appRoutes.saved}>View saved places</Link>
          <Link className="button button--quiet" to={appRoutes.nearby}>Nearby emergency services</Link>
        </div>
      )}
    >
      <p>Opening it needs an internet connection. Your saved places and the support services saved for My area still work offline.</p>
    </EmptyState>
  )
}
