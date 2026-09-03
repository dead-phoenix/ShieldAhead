import { createApiWifiRepository } from './api/apiWifiRepository'
import { getMockWifiRepository } from './mock/mockRepositories'
import { createOfflineAwareRepository } from './offline/offlineAwareRepository'
import { isOfflineDatasetSelected } from './offline/offlineDatasetStore'
import type { WifiRepository } from './repositories'

export type WifiDataSourceMode = 'api' | 'mock'

export function getWifiDataSourceMode(fixture: string | null): WifiDataSourceMode {
  if (fixture) return 'mock'
  return import.meta.env.VITE_DATA_SOURCE === 'api' ? 'api' : 'mock'
}

export function getWifiRepository(
  fixture: string | null,
  postcode: string,
): WifiRepository {
  const mode = getWifiDataSourceMode(fixture)
  if (fixture) return getMockWifiRepository(fixture)

  const configuredTimeout = Number(import.meta.env.VITE_API_TIMEOUT_MS)
  const onlineRepository = mode === 'mock'
    ? getMockWifiRepository(null)
    : createApiWifiRepository({
        baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
        postcode,
        timeoutMs: Number.isFinite(configuredTimeout) && configuredTimeout > 0
          ? configuredTimeout
          : 20_000,
      })

  return createOfflineAwareRepository({
    kind: 'wifi',
    postcode,
    source: mode,
    onlineRepository,
    shouldSave: () => isOfflineDatasetSelected('wifi'),
  })
}
