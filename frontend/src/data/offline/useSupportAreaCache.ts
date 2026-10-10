import { useEffect, useState, useSyncExternalStore } from 'react'
import { storageKeys } from '../../app/config/product'
import { getMyArea, MY_AREA_CHANGED_EVENT } from '../../storage/myAreaStorage'
import type { MyArea } from '../contracts'
import { OFFLINE_DATA_CHANGED_EVENT } from './offlineDatasetStore'
import {
  getSupportCacheActivity,
  readSupportAreaCache,
  refreshSupportAreaCache,
  subscribeToSupportCacheActivity,
  type SupportAreaCache,
  type SupportCacheActivity,
} from './supportAreaCache'

export interface SupportAreaCacheState {
  area: MyArea | null
  /** Only a copy saved for the current My area postcode. */
  cache: SupportAreaCache | null
  isReading: boolean
  activity: SupportCacheActivity
}

/** Reads the saved support list back from the device, so what is shown is what is stored. */
export function useSupportAreaCache(): SupportAreaCacheState {
  const activity = useSyncExternalStore(subscribeToSupportCacheActivity, getSupportCacheActivity, getSupportCacheActivity)
  const [state, setState] = useState<Omit<SupportAreaCacheState, 'activity'>>(() => ({
    area: getMyArea(),
    cache: null,
    isReading: true,
  }))

  useEffect(() => {
    let isCurrent = true
    const read = () => {
      const area = getMyArea()
      const pending = area ? readSupportAreaCache(area.postcode).catch(() => null) : Promise.resolve(null)
      void pending.then((cache) => {
        if (!isCurrent) return
        setState({ area, cache: cache && area && cache.postcode === area.postcode ? cache : null, isReading: false })
      })
    }
    read()
    window.addEventListener(OFFLINE_DATA_CHANGED_EVENT, read)
    window.addEventListener(MY_AREA_CHANGED_EVENT, read)
    return () => {
      isCurrent = false
      window.removeEventListener(OFFLINE_DATA_CHANGED_EVENT, read)
      window.removeEventListener(MY_AREA_CHANGED_EVENT, read)
    }
  }, [])

  return { ...state, activity }
}

function hasTriedThisSession(): boolean {
  try {
    return window.sessionStorage.getItem(storageKeys.supportCacheTried) !== null
  } catch {
    return true
  }
}

function markTriedThisSession(): void {
  try {
    window.sessionStorage.setItem(storageKeys.supportCacheTried, new Date().toISOString())
  } catch {
    // Without sessionStorage the start-up check is skipped rather than repeated.
  }
}

/**
 * Background save of the nearest support services for My area: once per
 * session on start, again whenever the device comes back online (a failed or
 * static copy is retried then) and whenever My area changes while online.
 */
export function useSupportAreaCacheRefresh(): void {
  useEffect(() => {
    function refreshOncePerSession() {
      if (!navigator.onLine || !getMyArea() || hasTriedThisSession()) return
      markTriedThisSession()
      void refreshSupportAreaCache()
    }

    function refreshWhenNeeded() {
      if (!navigator.onLine || !getMyArea()) return
      markTriedThisSession()
      void refreshSupportAreaCache()
    }

    refreshOncePerSession()
    window.addEventListener('online', refreshWhenNeeded)
    window.addEventListener(MY_AREA_CHANGED_EVENT, refreshWhenNeeded)
    return () => {
      window.removeEventListener('online', refreshWhenNeeded)
      window.removeEventListener(MY_AREA_CHANGED_EVENT, refreshWhenNeeded)
    }
  }, [])
}
