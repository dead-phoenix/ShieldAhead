import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { storageKeys } from '../app/config/product'

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
