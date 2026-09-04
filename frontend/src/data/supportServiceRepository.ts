import { createApiSupportServiceRepository } from './api/apiSupportServiceRepository'
import { createOfflineAwareRepository } from './offline/offlineAwareRepository'
import { isOfflineDatasetSelected } from './offline/offlineDatasetStore'
import type { SupportServiceRepository } from './repositories'

export function getSupportServiceRepository(postcode: string): SupportServiceRepository {
  const configuredTimeout = Number(import.meta.env.VITE_API_TIMEOUT_MS)
  const onlineRepository = createApiSupportServiceRepository({
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
    postcode,
    timeoutMs: Number.isFinite(configuredTimeout) && configuredTimeout > 0
      ? configuredTimeout
      : 20_000,
  })

  return createOfflineAwareRepository({
    kind: 'support',
    postcode,
    onlineRepository,
    shouldSave: () => isOfflineDatasetSelected('support'),
  })
}
