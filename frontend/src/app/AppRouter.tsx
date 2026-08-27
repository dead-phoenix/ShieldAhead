import { useEffect, useRef } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useLocation } from 'react-router-dom'
import { HomePage } from '../features/home/pages/HomePage'
import { HouseholdBasicsPage } from '../features/onboarding/pages/HouseholdBasicsPage'
import { SetupWelcomePage } from '../features/onboarding/pages/SetupWelcomePage'
import { SettingsPage } from '../features/settings/pages/SettingsPage'
import { SupportServicesPage } from '../features/support-services/pages/SupportServicesPage'
import { WifiListPage } from '../features/wifi/pages/WifiListPage'
import { AppShell } from '../shared/layout/AppShell'
import { appRoutes } from './config/product'

function RouteFocusManager() {
  const { pathname } = useLocation()
  const hasMounted = useRef(false)

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true
      return
    }

    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('#main-content')?.focus()
    })
  }, [pathname])

  return null
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <RouteFocusManager />
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path={appRoutes.setup} element={<SetupWelcomePage />} />
          <Route
            path={appRoutes.householdBasics}
            element={<HouseholdBasicsPage />}
          />
          <Route path={appRoutes.wifi} element={<WifiListPage />} />
          <Route path={appRoutes.support} element={<SupportServicesPage />} />
          <Route path={appRoutes.settings} element={<SettingsPage />} />
          <Route path="*" element={<Navigate replace to={appRoutes.home} />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
