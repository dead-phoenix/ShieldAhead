import { useCallback, useEffect, useState } from 'react'

export interface Connectivity {
  /** navigator.onLine, refined by any reported app-fetch failure — a
   * captive portal or a sleeping backend both leave navigator.onLine
   * `true`, so a page that makes its own requests can call
   * reportFetchOutcome(false) to mark the app degraded until the next
   * success. */
  isOnline: boolean
  reportFetchOutcome: (success: boolean) => void
}

/** Not yet wired into every page that used to call useOnlineStatus — those
 * still work, just without the fetch-outcome refinement. New offline-aware
 * UI (the app banner, the "ready offline" flow) uses this one. */
export function useConnectivity(): Connectivity {
  const [browserOnline, setBrowserOnline] = useState(() => navigator.onLine)
  const [isDegraded, setIsDegraded] = useState(false)

  useEffect(() => {
    const update = () => setBrowserOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  useEffect(() => {
    if (!browserOnline) setIsDegraded(false)
  }, [browserOnline])

  const reportFetchOutcome = useCallback((success: boolean) => {
    setIsDegraded(!success)
  }, [])

  return { isOnline: browserOnline && !isDegraded, reportFetchOutcome }
}
