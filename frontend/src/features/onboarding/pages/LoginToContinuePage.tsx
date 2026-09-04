import { Link } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'

export function LoginToContinuePage() {
  return (
    <section className="flow-page login-prompt" aria-labelledby="login-prompt-title">
      <h1 id="login-prompt-title">Log in to continue</h1>
      <p className="lead">
        Save a household profile on this device to open nearby Wi-Fi and support lists.
      </p>
      <nav className="header-auth" aria-label="Account">
        <Link className="header-auth__login" to={appRoutes.setup}>Log in</Link>
        <Link className="header-auth__signup" to={appRoutes.setup}>Sign up</Link>
      </nav>
      <Link className="button button--text" to={appRoutes.home}>Back to home</Link>
    </section>
  )
}
