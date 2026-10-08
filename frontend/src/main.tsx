import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { preloadNearbyData } from './data/preloadNearbyData'
import { capturePwaInstallPrompt } from './shared/pwa/pwaInstall'
import { registerServiceWorkerUpdates } from './shared/pwa/serviceWorkerUpdate'
import { migrateLegacyLocalData } from './storage/legacyLocalDataMigration'
import { getSearchPostcode } from './storage/searchLocationStorage'

capturePwaInstallPrompt()
migrateLegacyLocalData()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

const existingPostcode = getSearchPostcode()
if (existingPostcode) {
  void preloadNearbyData(existingPostcode)
}

if (import.meta.env.PROD) {
  window.addEventListener('load', registerServiceWorkerUpdates)
}
