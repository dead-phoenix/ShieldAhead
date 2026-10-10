import {
  ArrowClockwise,
  CloudSlash,
  FirstAidKit,
  House,
  Lifebuoy,
  MapTrifold,
  ShieldCheck,
  UserCircle,
} from '@phosphor-icons/react'
import type { CSSProperties } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { appRoutes, productConfig } from '../../app/config/product'
import { readNearbySnapshot } from '../../data/offline/nearbySnapshot'
import { useNearbySnapshotRefresh } from '../../data/offline/useNearbySnapshotRefresh'
import { useSupportAreaCacheRefresh } from '../../data/offline/useSupportAreaCache'
import { hasCompletedSetup } from '../../storage/onboardingDraftStorage'
import { GetTheAppButton } from '../components/GetTheAppButton'
import { useConnectivity } from '../hooks/useConnectivity'
import { useServiceWorkerUpdate } from '../hooks/useServiceWorkerUpdate'
import { formatSavedDate } from '../utils/formatDate'

const primaryNavigation = [
  { to: appRoutes.home, label: 'Home', end: true, icon: House },
  { to: appRoutes.map, label: 'Support', icon: MapTrifold },
  { to: appRoutes.crisis, label: 'Crisis', icon: Lifebuoy },
  { to: appRoutes.emergencyPack, label: 'Crisis pack', icon: FirstAidKit },
]

export function AppShell() {
  useNearbySnapshotRefresh()
  useSupportAreaCacheRefresh()
  const { isOnline } = useConnectivity()
  const { hasUpdate, reload } = useServiceWorkerUpdate()
  const { pathname } = useLocation()
  const isSetupFlow = pathname.startsWith(appRoutes.setup)
  const showSetupAction = !isSetupFlow && !hasCompletedSetup()
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
            {showSetupAction ? (
              <Link className="header-auth__signup" to={appRoutes.setup}>Set up my household</Link>
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

      {!isOnline ? (
        <p className="app-offline-banner" role="status">
          <CloudSlash aria-hidden="true" size={18} />
          {' '}You're offline. Showing information saved on {formatSavedDate(readNearbySnapshot()?.builtAt)}.
          In an emergency call 000. Check VicEmergency when you're back online.
        </p>
      ) : null}

      {hasUpdate ? (
        <p className="app-update-banner" role="status">
          A new version is ready.
          <button className="button button--quiet button--compact" type="button" onClick={reload}>
            <ArrowClockwise aria-hidden="true" size={16} /> Reload to update
          </button>
        </p>
      ) : null}

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
