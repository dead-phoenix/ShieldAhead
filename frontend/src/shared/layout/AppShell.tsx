import {
  HandHeart,
  House,
  ShieldCheck,
  UserCircle,
  WifiHigh,
} from '@phosphor-icons/react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { appRoutes, productConfig } from '../../app/config/product'
import { hasCompletedSetup } from '../../storage/onboardingDraftStorage'

const primaryNavigation = [
  { to: appRoutes.home, label: 'Home', end: true, icon: House },
  { to: appRoutes.wifi, label: 'Wi-Fi', icon: WifiHigh },
  { to: appRoutes.support, label: 'Support', icon: HandHeart },
  { to: appRoutes.settings, label: 'Profile', icon: UserCircle },
]

export function AppShell() {
  const { pathname } = useLocation()
  const isHome = pathname === appRoutes.home
  const isSetupFlow = pathname.startsWith(appRoutes.setup)
  const showAuthActions = isHome && !hasCompletedSetup()

  return (
    <div className={`app-shell${isSetupFlow ? ' app-shell--flow' : ''}`}>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <header className="app-header">
        <NavLink className="brand" to={appRoutes.home}>
          <ShieldCheck className="brand-mark" aria-hidden="true" weight="duotone" />
          <span>
            <strong>{productConfig.name}</strong>
            <small>{productConfig.status}</small>
          </span>
        </NavLink>
        {showAuthActions ? (
          <nav className="header-auth" aria-label="Account">
            <Link className="header-auth__login" to={appRoutes.setup}>Log in</Link>
            <Link className="header-auth__signup" to={appRoutes.setup}>Sign up</Link>
          </nav>
        ) : null}
      </header>

      {!isSetupFlow ? (
        <nav className="desktop-nav" aria-label="Primary navigation">
          {primaryNavigation.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                className={({ isActive }) => (isActive ? 'is-active' : undefined)}
                end={item.end}
                to={item.to}
              >
                <Icon aria-hidden="true" size={22} weight="regular" />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>
      ) : null}

      <main id="main-content" className="app-main" tabIndex={-1}>
        <Outlet />
      </main>

      {!isSetupFlow ? (
        <nav className="mobile-nav" aria-label="Primary navigation">
          {primaryNavigation.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                className={({ isActive }) => (isActive ? 'is-active' : undefined)}
                end={item.end}
                to={item.to}
              >
                <Icon aria-hidden="true" size={22} weight="regular" />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>
      ) : null}
    </div>
  )
}
