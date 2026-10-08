import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { storageKeys } from '../app/config/product'

// Marks the background nearby refresh as already tried so rendering AppShell
// never fetches /data/*.json; tests of that refresh remove this key.
beforeEach(() => {
  window.sessionStorage.setItem(storageKeys.nearbyRefreshTried, 'test')
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  window.sessionStorage.removeItem(storageKeys.nearbyRefreshTried)
})
