import { useCallback, useEffect, useState } from 'react'
import {
  getOfflineDatasetSummaries,
  OFFLINE_DATA_CHANGED_EVENT,
  type OfflineDatasetKind,
  type OfflineDatasetSummary,
} from './offlineDatasetStore'

export function useOfflineDatasetSummaries(postcode: string) {
  const [summaries, setSummaries] = useState<Partial<Record<OfflineDatasetKind, OfflineDatasetSummary>>>({})
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(() => {
    setIsLoading(true)
    getOfflineDatasetSummaries(postcode)
      .then(setSummaries)
      .catch(() => setSummaries({}))
      .finally(() => setIsLoading(false))
  }, [postcode])

  useEffect(() => {
    let isCurrent = true
    getOfflineDatasetSummaries(postcode)
      .then((result) => {
        if (isCurrent) setSummaries(result)
      })
      .catch(() => {
        if (isCurrent) setSummaries({})
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false)
      })
    window.addEventListener(OFFLINE_DATA_CHANGED_EVENT, refresh)
    return () => {
      isCurrent = false
      window.removeEventListener(OFFLINE_DATA_CHANGED_EVENT, refresh)
    }
  }, [postcode, refresh])

  return { summaries, isLoading, refresh }
}
