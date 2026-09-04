import type { DatasetResult } from '../contracts'
import type { OfflineDatasetKind } from './offlineDatasetStore'
import { readOfflineDataset, saveOfflineDataset } from './offlineDatasetStore'

const STALE_AFTER_MS = 24 * 60 * 60 * 1000

interface ListRepository<T> {
  list(): Promise<DatasetResult<T>>
}

interface OfflineAwareRepositoryOptions<T> {
  kind: OfflineDatasetKind
  postcode: string
  onlineRepository: ListRepository<T>
  shouldSave: () => boolean
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

export function createOfflineAwareRepository<T>({
  kind,
  postcode,
  onlineRepository,
  shouldSave,
  isOnline = () => navigator.onLine,
  now = () => Date.now(),
}: OfflineAwareRepositoryOptions<T>): ListRepository<T> {
  return {
    async list() {
      const cacheAllowed = shouldSave()

      if (!isOnline()) {
        if (!cacheAllowed) {
          throw new Error('This information was not selected for offline use.')
        }
        const stored = await readOfflineDataset<T>(kind, postcode)
        return cachedResult(stored, undefined, now())
      }

      try {
        const downloaded = await onlineRepository.list()
        let cachedAt: string | undefined
        if (cacheAllowed) {
          try {
            cachedAt = await saveOfflineDataset(kind, postcode, downloaded)
          } catch {
            // An IndexedDB failure must not make otherwise-valid online data unusable.
          }
        }
        return {
          ...downloaded,
          metadata: {
            ...downloaded.metadata,
            dataOrigin: 'network',
            cachedAt,
          },
        }
      } catch (reason) {
        if (cacheAllowed) {
          try {
            const stored = await readOfflineDataset<T>(kind, postcode)
            if (stored) return cachedResult(stored, errorMessage(reason), now())
          } catch {
            // Preserve the original network error when offline storage also fails.
          }
        }
        throw reason
      }
    },
  }
}
