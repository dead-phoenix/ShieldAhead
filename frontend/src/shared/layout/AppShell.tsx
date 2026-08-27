import { NavLink, Outlet } from 'react-router-dom'
import { appRoutes, productConfig } from '../../app/config/product'

const primaryNavigation = [
  { to: appRoutes.home, label: 'Home', end: true },
  { to: appRoutes.wifi, label: 'Wi-Fi' },
  { to: appRoutes.support, label: 'Support' },
  { to: appRoutes.settings, label: 'My data' },
]

export function AppShell() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <header className="app-header">
        <NavLink className="brand" to={appRoutes.home}>
          <span className="brand-mark" aria-hidden="true" />
          <span>
            <strong>{productConfig.name}</strong>
            <small>{productConfig.status}</small>
          </span>
        </NavLink>

        <nav className="desktop-nav" aria-label="Primary navigation">
          {primaryNavigation.map((item) => (
            <NavLink
              key={item.to}
              className={({ isActive }) => (isActive ? 'is-active' : undefined)}
              end={item.end}
              to={item.to}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main id="main-content" className="app-main" tabIndex={-1}>
        <Outlet />
      </main>

      <nav className="mobile-nav" aria-label="Primary navigation">
        {primaryNavigation.map((item) => (
          <NavLink
            key={item.to}
            className={({ isActive }) => (isActive ? 'is-active' : undefined)}
            end={item.end}
            to={item.to}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
