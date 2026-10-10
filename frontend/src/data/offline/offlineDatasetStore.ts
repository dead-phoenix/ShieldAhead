import type { DatasetResult, SupportService, WifiLocation } from '../contracts'

export type OfflineDatasetKind = 'wifi' | 'support'

export interface OfflineDatasetSummary {
  kind: OfflineDatasetKind
  postcode: string
  savedAt: string
  recordCount: number
  version: string
}

export type OfflineDatasetSource = 'api' | 'static'

export interface OfflineDatasetDetails {
  areaLabel?: string
  dataSource?: OfflineDatasetSource
}

export interface StoredDataset<T> extends OfflineDatasetDetails {
  key: string
  kind: OfflineDatasetKind
  postcode: string
  savedAt: string
  count?: number
  data: DatasetResult<T>
}

const DATABASE_NAME = 'shieldahead-offline-v1'
const DATABASE_VERSION = 1
const DATASET_STORE = 'datasets'
export const OFFLINE_DATA_CHANGED_EVENT = 'shieldahead:offline-data-changed'

function datasetKey(kind: OfflineDatasetKind, postcode: string) {
  return `${kind}:${postcode}`
}

function openDatabase(): Promise<IDBDatabase> {
  if (!('indexedDB' in window)) {
    return Promise.reject(new Error('Offline storage is not supported by this browser.'))
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(DATASET_STORE)) {
        database.createObjectStore(DATASET_STORE, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Offline storage could not be opened.'))
    request.onblocked = () => reject(new Error('Offline storage is blocked by another app window.'))
  })
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then((database) => new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(DATASET_STORE, mode)
    const request = operation(transaction.objectStore(DATASET_STORE))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Offline data could not be updated.'))
    transaction.oncomplete = () => database.close()
    transaction.onerror = () => {
      database.close()
      reject(transaction.error ?? new Error('Offline data could not be updated.'))
    }
    transaction.onabort = () => {
      database.close()
      reject(transaction.error ?? new Error('Offline data update was cancelled.'))
    }
  }))
}

function announceChange() {
  window.dispatchEvent(new Event(OFFLINE_DATA_CHANGED_EVENT))
}

export async function saveOfflineDataset<T>(
  kind: OfflineDatasetKind,
  postcode: string,
  data: DatasetResult<T>,
  details: OfflineDatasetDetails = {},
): Promise<string> {
  const savedAt = new Date().toISOString()
  const stored: StoredDataset<T> = {
    key: datasetKey(kind, postcode),
    kind,
    postcode,
    savedAt,
    count: data.records.length,
    ...details,
    data,
  }
  await runTransaction('readwrite', (store) => store.put(stored))
  announceChange()
  return savedAt
}

export function readOfflineDataset<T>(
  kind: OfflineDatasetKind,
  postcode: string,
): Promise<StoredDataset<T> | null> {
  return runTransaction<StoredDataset<T> | undefined>(
    'readonly',
    (store) => store.get(datasetKey(kind, postcode)),
  ).then((result) => result ?? null)
}

export async function removeOfflineDataset(
  kind: OfflineDatasetKind,
  postcode: string,
): Promise<void> {
  await runTransaction('readwrite', (store) => store.delete(datasetKey(kind, postcode)))
  announceChange()
}

export async function readAllOfflineDatasets<T>(kind: OfflineDatasetKind): Promise<StoredDataset<T>[]> {
  const all = await runTransaction<StoredDataset<T>[]>('readonly', (store) => store.getAll())
  return all.filter((item) => item.kind === kind)
}

/** Deletes every dataset of this kind except the one saved for keepPostcode. */
export async function removeOfflineDatasetsExcept(
  kind: OfflineDatasetKind,
  keepPostcode: string,
): Promise<void> {
  const stale = (await readAllOfflineDatasets(kind)).filter((item) => item.postcode !== keepPostcode)
  if (stale.length === 0) return
  for (const item of stale) {
    await runTransaction('readwrite', (store) => store.delete(item.key))
  }
  announceChange()
}

export async function clearAllOfflineDatasets(): Promise<void> {
  await runTransaction('readwrite', (store) => store.clear())
  announceChange()
}

/** Resolves even when the deletion is blocked; the browser finishes it once other windows close their connection. */
export function deleteOfflineDatabase(): Promise<void> {
  if (!('indexedDB' in window)) return Promise.resolve()
  return new Promise<void>((resolve) => {
    const request = window.indexedDB.deleteDatabase(DATABASE_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  }).then(announceChange)
}

export async function getOfflineDatasetSummaries(
  postcode: string,
): Promise<Partial<Record<OfflineDatasetKind, OfflineDatasetSummary>>> {
  const [wifi, support] = await Promise.all([
    readOfflineDataset<WifiLocation>('wifi', postcode),
    readOfflineDataset<SupportService>('support', postcode),
  ])

  return Object.fromEntries(
    [wifi, support]
      .filter((item): item is StoredDataset<WifiLocation | SupportService> => Boolean(item))
      .map((item) => [item.kind, {
        kind: item.kind,
        postcode: item.postcode,
        savedAt: item.savedAt,
        recordCount: item.data.records.length,
        version: item.data.metadata.version,
      }]),
  )
}
