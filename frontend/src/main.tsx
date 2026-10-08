import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { preloadNearbyData } from './data/preloadNearbyData'
import { capturePwaInstallPrompt } from './shared/pwa/pwaInstall'
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

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // The online app remains usable when service-worker registration fails.
    })
  })
}
