import { createApiWifiRepository } from './api/apiWifiRepository'
import { getMockWifiRepository } from './mock/mockRepositories'
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
  if (getWifiDataSourceMode(fixture) === 'mock') {
    return getMockWifiRepository(fixture)
  }

  const configuredTimeout = Number(import.meta.env.VITE_API_TIMEOUT_MS)
  return createApiWifiRepository({
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
    postcode,
    timeoutMs: Number.isFinite(configuredTimeout) && configuredTimeout > 0
      ? configuredTimeout
      : 20_000,
  })
}
