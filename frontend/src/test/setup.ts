import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { storageKeys } from '../app/config/product'

// jsdom doesn't implement scrollTo (used by AppRouter's scroll-to-top-on-
// navigation effect) and logs a "not implemented" warning on every call
// otherwise — a harmless no-op here, since no test actually checks scroll
// position via jsdom's layout (it has none).
beforeEach(() => {
  window.scrollTo = vi.fn()
})

// Marks the background nearby refresh and support-list save as already tried
// so rendering AppShell never fetches; tests of those refreshes remove the keys.
beforeEach(() => {
  window.sessionStorage.setItem(storageKeys.nearbyRefreshTried, 'test')
  window.sessionStorage.setItem(storageKeys.supportCacheTried, 'test')
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  window.sessionStorage.removeItem(storageKeys.nearbyRefreshTried)
  window.sessionStorage.removeItem(storageKeys.supportCacheTried)
})
