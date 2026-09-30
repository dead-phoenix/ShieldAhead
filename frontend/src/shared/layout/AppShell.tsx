import {
  House,
  Lifebuoy,
  MapTrifold,
  ShieldCheck,
  UserCircle,
} from '@phosphor-icons/react'
import type { CSSProperties } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { appRoutes, productConfig } from '../../app/config/product'
import { hasCompletedSetup } from '../../storage/onboardingDraftStorage'
import { GetTheAppButton } from '../components/GetTheAppButton'

const primaryNavigation = [
  { to: appRoutes.home, label: 'Home', end: true, icon: House },
  { to: appRoutes.map, label: 'Support', icon: MapTrifold },
  { to: appRoutes.crisis, label: 'Crisis', icon: Lifebuoy },
]

export function AppShell() {
  const { pathname } = useLocation()
  const isSetupFlow = pathname.startsWith(appRoutes.setup)
  const showAuthActions = !isSetupFlow && !hasCompletedSetup()
  const activeNavigationIndex = primaryNavigation.findIndex((item) =>
    item.end ? pathname === item.to : pathname.startsWith(item.to),
  )
  const navigationStyle = {
    '--nav-active-index': Math.max(activeNavigationIndex, 0),
  } as CSSProperties

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
        {!isSetupFlow ? (
          <nav className="desktop-nav nav-flow" aria-label="Primary navigation" style={navigationStyle}>
            {primaryNavigation.map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.to}
                  className={({ isActive }) => (isActive ? 'is-active' : undefined)}
                  end={item.end}
                  to={item.to}
                >
                  <Icon aria-hidden="true" size={20} weight="regular" />
                  <span>{item.label}</span>
                </NavLink>
              )
            })}
          </nav>
        ) : null}
        {!isSetupFlow ? (
          <nav className="header-auth" aria-label="Site actions">
            <GetTheAppButton />
            {showAuthActions ? (
              <>
                <Link className="header-auth__login" to={appRoutes.setup}>Log in</Link>
                <Link className="header-auth__signup" to={appRoutes.setup}>Sign up</Link>
              </>
            ) : null}
            <NavLink
              aria-label="Profile"
              className={({ isActive }) => `header-profile-link${isActive ? ' is-active' : ''}`}
              title="Profile"
              to={appRoutes.settings}
            >
              <UserCircle aria-hidden="true" size={25} weight="regular" />
            </NavLink>
          </nav>
        ) : null}
      </header>

      <main id="main-content" className="app-main" tabIndex={-1}>
        <Outlet />
      </main>

      {!isSetupFlow ? (
        <nav className="mobile-nav nav-flow" aria-label="Primary navigation" style={navigationStyle}>
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
