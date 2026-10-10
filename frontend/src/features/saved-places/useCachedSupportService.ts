import { useEffect, useState } from 'react'
import type { SupportService } from '../../data/contracts'
import { readSupportAreaCache, type SupportAreaCache } from '../../data/offline/supportAreaCache'
import { getMyArea } from '../../storage/myAreaStorage'

export type CachedSupportServiceState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; service?: SupportService; cache?: SupportAreaCache }

/** Looks the service up in the support list saved for My area. */
export function useCachedSupportService(id: string | undefined, enabled: boolean): CachedSupportServiceState {
  const [result, setResult] = useState<{ id: string; service?: SupportService; cache?: SupportAreaCache } | null>(null)

  useEffect(() => {
    if (!enabled || !id) return
    let isCurrent = true
    const area = getMyArea()
    const pending = area ? readSupportAreaCache(area.postcode).catch(() => null) : Promise.resolve(null)
    void pending.then((cache) => {
      if (!isCurrent) return
      setResult({ id, service: cache?.records.find((record) => record.id === id), cache: cache ?? undefined })
    })
    return () => {
      isCurrent = false
    }
  }, [enabled, id])

  if (!enabled || !id) return { status: 'idle' }
  if (!result || result.id !== id) return { status: 'loading' }
  return { status: 'done', service: result.service, cache: result.cache }
}
