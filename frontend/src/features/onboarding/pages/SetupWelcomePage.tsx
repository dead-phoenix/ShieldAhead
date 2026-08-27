import { Link } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { StatusBanner } from '../../../shared/components/StatusBanner'

export function SetupWelcomePage() {
  return (
    <section className="flow-page" aria-labelledby="setup-title">
      <div className="step-progress">
        <span>Step 1 of 5</span>
        <progress value="1" max="5">
          1 of 5
        </progress>
      </div>

      <h1 id="setup-title">Prepare this device for your household</h1>
      <p className="lead">
        A few details can help us organise relevant information. You can skip
        optional questions and change or delete your answers later.
      </p>

      <StatusBanner title="Stored only on this device">
        <p>
          This setup does not create an account or upload your household
          answers. We will ask before anything is saved.
        </p>
      </StatusBanner>

      <ul className="plain-checklist">
        <li>About five short steps</li>
        <li>Optional questions are clearly marked</li>
        <li>Your answers can be reviewed before saving</li>
      </ul>

      <div className="flow-actions">
        <Link className="button button--primary" to={appRoutes.householdBasics}>
          Start setup
        </Link>
        <Link className="button button--quiet" to={appRoutes.home}>
          Not now
        </Link>
      </div>
    </section>
  )
}
