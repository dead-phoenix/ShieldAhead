import { useEffect, useRef } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useLocation } from 'react-router-dom'
import { HomePage } from '../features/home/pages/HomePage'
import { CrisisLandingPage } from '../features/crisis/pages/CrisisLandingPage'
import { CrisisDetailPage } from '../features/crisis/pages/CrisisDetailPage'
import { CrisisGuidancePage } from '../features/crisis/pages/CrisisGuidancePage'
import { ChooseLocationPage } from '../features/location/pages/ChooseLocationPage'
import { HouseholdBasicsPage } from '../features/onboarding/pages/HouseholdBasicsPage'
import { HouseholdNeedsPage } from '../features/onboarding/pages/HouseholdNeedsPage'
import { ConsentChoicesPage } from '../features/onboarding/pages/ConsentChoicesPage'
import { DataPrivacyPage } from '../features/onboarding/pages/DataPrivacyPage'
import { SetupCompletePage } from '../features/onboarding/pages/SetupCompletePage'
import { SetupReviewPage } from '../features/onboarding/pages/SetupReviewPage'
import { SetupWelcomePage } from '../features/onboarding/pages/SetupWelcomePage'
import { DeleteProfilePage } from '../features/settings/pages/DeleteProfilePage'
import { EditProfilePage } from '../features/settings/pages/EditProfilePage'
import { ConsentSettingsPage } from '../features/settings/pages/ConsentSettingsPage'
import { OfflineInformationPage } from '../features/settings/pages/OfflineInformationPage'
import { SettingsPage } from '../features/settings/pages/SettingsPage'
import { SupportServiceDetailPage } from '../features/support-services/pages/SupportServiceDetailPage'
import { WifiDetailPage } from '../features/wifi/pages/WifiDetailPage'
import { EmergencyPackPage } from '../features/emergency-pack/pages/EmergencyPackPage'
import { MapPage } from '../features/map/pages/MapPage'
import { AppShell } from '../shared/layout/AppShell'
import { getSearchPostcode } from '../storage/searchLocationStorage'
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

function RequireSearchLocation() {
  const location = useLocation()
  if (getSearchPostcode()) return <Outlet />
  const next = `${location.pathname}${location.search}`
  return <Navigate replace to={`${appRoutes.location}?next=${encodeURIComponent(next)}`} />
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <RouteFocusManager />
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path={appRoutes.setup} element={<SetupWelcomePage />} />
          <Route path={appRoutes.setupPrivacy} element={<DataPrivacyPage />} />
          <Route
            path={appRoutes.householdBasics}
            element={<HouseholdBasicsPage />}
          />
          <Route path={appRoutes.householdNeeds} element={<HouseholdNeedsPage />} />
          <Route path={appRoutes.setupReview} element={<SetupReviewPage />} />
          <Route path={appRoutes.consentChoices} element={<ConsentChoicesPage />} />
          <Route path={appRoutes.setupComplete} element={<SetupCompletePage />} />
          <Route path={appRoutes.location} element={<ChooseLocationPage />} />
          <Route path={appRoutes.crisis} element={<CrisisLandingPage />} />
          <Route path={appRoutes.emergencyPack} element={<EmergencyPackPage />} />
          <Route path="/crisis/:kind" element={<CrisisDetailPage />} />
          <Route path="/crisis/:kind/guidance" element={<CrisisGuidancePage />} />
          <Route element={<RequireSearchLocation />}>
            <Route path={appRoutes.map} element={<MapPage />} />
            <Route path={appRoutes.wifi} element={<Navigate replace to={`${appRoutes.map}?category=wifi`} />} />
            <Route path="/wifi/:id" element={<WifiDetailPage />} />
            <Route path={appRoutes.support} element={<Navigate replace to={`${appRoutes.map}?category=support`} />} />
            <Route path="/support/:id" element={<SupportServiceDetailPage />} />
          </Route>
          <Route path={appRoutes.settings} element={<SettingsPage />} />
          <Route path={appRoutes.editProfile} element={<EditProfilePage />} />
          <Route path={appRoutes.consentSettings} element={<ConsentSettingsPage />} />
          <Route path={appRoutes.offlineInformation} element={<OfflineInformationPage />} />
          <Route path={appRoutes.deleteProfile} element={<DeleteProfilePage />} />
          <Route path="*" element={<Navigate replace to={appRoutes.home} />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
