import { createApiWifiRepository } from './api/apiWifiRepository'
import { createOfflineAwareRepository } from './offline/offlineAwareRepository'
import type { WifiRepository } from './repositories'

export function getWifiRepository(postcode: string): WifiRepository {
  const configuredTimeout = Number(import.meta.env.VITE_API_TIMEOUT_MS)
  const onlineRepository = createApiWifiRepository({
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
    postcode,
    timeoutMs: Number.isFinite(configuredTimeout) && configuredTimeout > 0
      ? configuredTimeout
      : 20_000,
  })

  return createOfflineAwareRepository({
    kind: 'wifi',
    postcode,
    onlineRepository,
  })
}
