import { useEffect, useRef } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useLocation } from 'react-router-dom'
import { HomePage } from '../features/home/pages/HomePage'
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
import { SupportServicesPage } from '../features/support-services/pages/SupportServicesPage'
import { WifiDetailPage } from '../features/wifi/pages/WifiDetailPage'
import { WifiListPage } from '../features/wifi/pages/WifiListPage'
import { AppShell } from '../shared/layout/AppShell'
import { getConsentState, getHouseholdProfile } from '../storage/onboardingDraftStorage'
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

function RequireCompletedSetup() {
  const hasCompletedSetup = Boolean(getHouseholdProfile() && getConsentState())
  return hasCompletedSetup ? <Outlet /> : <Navigate replace to={appRoutes.setup} />
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <RouteFocusManager />
      <Routes>
        <Route element={<AppShell />}>
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
          <Route element={<RequireCompletedSetup />}>
            <Route index element={<HomePage />} />
            <Route path={appRoutes.wifi} element={<WifiListPage />} />
            <Route path="/wifi/:id" element={<WifiDetailPage />} />
            <Route path={appRoutes.support} element={<SupportServicesPage />} />
            <Route path="/support/:id" element={<SupportServiceDetailPage />} />
            <Route path={appRoutes.settings} element={<SettingsPage />} />
            <Route path={appRoutes.editProfile} element={<EditProfilePage />} />
            <Route path={appRoutes.consentSettings} element={<ConsentSettingsPage />} />
            <Route path={appRoutes.offlineInformation} element={<OfflineInformationPage />} />
            <Route path={appRoutes.deleteProfile} element={<DeleteProfilePage />} />
            <Route path="*" element={<Navigate replace to={appRoutes.home} />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
