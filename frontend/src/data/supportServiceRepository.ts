import { createApiSupportServiceRepository } from './api/apiSupportServiceRepository'
import { getMockSupportServiceRepository } from './mock/mockRepositories'
import type { SupportServiceRepository } from './repositories'

export type SupportDataSourceMode = 'api' | 'mock'

export function getSupportDataSourceMode(fixture: string | null): SupportDataSourceMode {
  if (fixture) return 'mock'
  return import.meta.env.VITE_DATA_SOURCE === 'api' ? 'api' : 'mock'
}

export function getSupportServiceRepository(
  fixture: string | null,
  postcode: string,
): SupportServiceRepository {
  if (getSupportDataSourceMode(fixture) === 'mock') {
    return getMockSupportServiceRepository(fixture)
  }

  const configuredTimeout = Number(import.meta.env.VITE_API_TIMEOUT_MS)
  return createApiSupportServiceRepository({
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
    postcode,
    timeoutMs: Number.isFinite(configuredTimeout) && configuredTimeout > 0
      ? configuredTimeout
      : 20_000,
  })
}