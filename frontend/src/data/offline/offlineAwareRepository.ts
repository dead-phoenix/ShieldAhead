import type { DatasetResult } from '../contracts'
import type { OfflineDatasetKind } from './offlineDatasetStore'
import { readOfflineDataset } from './offlineDatasetStore'

const STALE_AFTER_MS = 24 * 60 * 60 * 1000

interface ListRepository<T> {
  list(): Promise<DatasetResult<T>>
}

interface OfflineAwareRepositoryOptions<T> {
  kind: OfflineDatasetKind
  postcode: string
  onlineRepository: ListRepository<T>
  isOnline?: () => boolean
  now?: () => number
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error && reason.message
    ? reason.message
    : 'The latest information could not be downloaded.'
}

function cachedResult<T>(
  stored: Awaited<ReturnType<typeof readOfflineDataset<T>>>,
  refreshError: string | undefined,
  now: number,
): DatasetResult<T> {
  if (!stored) throw new Error('No saved information is available for this postcode.')
  const isOld = now - Date.parse(stored.savedAt) > STALE_AFTER_MS
  return {
    ...stored.data,
    metadata: {
      ...stored.data.metadata,
      dataOrigin: 'cache',
      cachedAt: stored.savedAt,
      refreshError,
      freshnessStatus: refreshError || isOld
        ? 'stale'
        : stored.data.metadata.freshnessStatus,
    },
  }
}

/**
 * Reads the saved copy for this postcode when offline or when the download
 * fails. Never writes: only the My area support cache (supportAreaCache.ts)
 * saves datasets, so a searched postcode is never stored.
 */
export function createOfflineAwareRepository<T>({
  kind,
  postcode,
  onlineRepository,
  isOnline = () => navigator.onLine,
  now = () => Date.now(),
}: OfflineAwareRepositoryOptions<T>): ListRepository<T> {
  return {
    async list() {
      if (!isOnline()) {
        const stored = await readOfflineDataset<T>(kind, postcode)
        return cachedResult(stored, undefined, now())
      }

      try {
        const downloaded = await onlineRepository.list()
        return {
          ...downloaded,
          metadata: {
            ...downloaded.metadata,
            dataOrigin: 'network',
          },
        }
      } catch (reason) {
        try {
          const stored = await readOfflineDataset<T>(kind, postcode)
          if (stored) return cachedResult(stored, errorMessage(reason), now())
        } catch {
          // Preserve the original network error when offline storage also fails.
        }
        throw reason
      }
    },
  }
}
