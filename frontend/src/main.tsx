import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { preloadNearbyData } from './data/preloadNearbyData'
import { getHouseholdProfile } from './storage/onboardingDraftStorage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// If a postcode is already saved from a previous session, start loading
// wifi + support services for it right away on app start -- not just when
// it's newly saved -- so returning households aren't stuck waiting until
// they open those specific pages.
const existingPostcode = getHouseholdProfile()?.postcode
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