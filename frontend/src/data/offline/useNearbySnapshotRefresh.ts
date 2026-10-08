import { useEffect } from 'react'
import { storageKeys } from '../../app/config/product'
import { getMyArea, MY_AREA_CHANGED_EVENT } from '../../storage/myAreaStorage'
import { refreshNearbySnapshot } from './nearbySnapshot'

function hasTriedThisSession(): boolean {
  try {
    return window.sessionStorage.getItem(storageKeys.nearbyRefreshTried) !== null
  } catch {
    return true
  }
}

function markTriedThisSession(): void {
  try {
    window.sessionStorage.setItem(storageKeys.nearbyRefreshTried, new Date().toISOString())
  } catch {
    // Without sessionStorage the refresh is skipped rather than repeated.
  }
}

function refreshSilently(): void {
  refreshNearbySnapshot().catch(() => {
    // Silent by design: the previous snapshot stays and pages show its own date.
  })
}

/**
 * Background refresh of the saved nearby services. Runs at most once per
 * session, only while online and only when My area is set (retried when the
 * device comes online). Also rebuilds when My area changes while online.
 */
export function useNearbySnapshotRefresh(): void {
  useEffect(() => {
    function refreshOncePerSession() {
      if (!navigator.onLine || !getMyArea() || hasTriedThisSession()) return
      markTriedThisSession()
      refreshSilently()
    }

    function refreshForNewArea() {
      if (!navigator.onLine || !getMyArea()) return
      markTriedThisSession()
      refreshSilently()
    }

    refreshOncePerSession()
    window.addEventListener('online', refreshOncePerSession)
    window.addEventListener(MY_AREA_CHANGED_EVENT, refreshForNewArea)
    return () => {
      window.removeEventListener('online', refreshOncePerSession)
      window.removeEventListener(MY_AREA_CHANGED_EVENT, refreshForNewArea)
    }
  }, [])
}
