import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { preloadNearbyData } from './data/preloadNearbyData'
import { removeGpsStartedRoutes } from './features/map/data/offlineRouteStorage'
import { migrateUsualWifiSpot } from './features/saved-places/migrateUsualWifiSpot'
import { capturePwaInstallPrompt } from './shared/pwa/pwaInstall'
import { registerServiceWorkerUpdates } from './shared/pwa/serviceWorkerUpdate'
import { migrateLegacyLocalData } from './storage/legacyLocalDataMigration'
import { getMyArea } from './storage/myAreaStorage'
import { getSearchPostcode } from './storage/searchLocationStorage'

capturePwaInstallPrompt()
migrateLegacyLocalData()
removeGpsStartedRoutes()
void migrateUsualWifiSpot()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

const existingPostcode = getSearchPostcode()
if (existingPostcode) {
  void preloadNearbyData(existingPostcode, { includeSupport: existingPostcode !== getMyArea()?.postcode })
}

if (import.meta.env.PROD) {
  window.addEventListener('load', registerServiceWorkerUpdates)
}
