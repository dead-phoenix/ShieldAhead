import type { CrisisPackMapPosition } from './renderCrisisPackMap'

/** Device-only store for the crisis pack's street map picture; nothing here is sent anywhere. */
export const CRISIS_PACK_DATABASE_NAME = 'shieldahead-crisis-pack-v1'
const DATABASE_VERSION = 1
const MAP_SNAPSHOT_STORE = 'map-snapshots'
const CURRENT_SNAPSHOT_ID = 'current'

export interface CrisisPackMapSnapshot {
  /** crisisPackPlacesKey() of the places drawn, including the style URL. */
  placesKey: string
  styleUrl: string
  createdAt: string
  attribution: string
  width: number
  height: number
  pixelRatio: number
  imageType: string
  imageBytes: ArrayBuffer
  positions: CrisisPackMapPosition[]
  metersPerPixel: number
  zoom: number
  centerLatitude: number
}

interface StoredSnapshot extends CrisisPackMapSnapshot {
  id: string
}

function openDatabase(): Promise<IDBDatabase> {
  if (!('indexedDB' in window)) return Promise.reject(new Error('IndexedDB is not available.'))
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(CRISIS_PACK_DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(MAP_SNAPSHOT_STORE)) {
        request.result.createObjectStore(MAP_SNAPSHOT_STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Crisis pack storage could not be opened.'))
    request.onblocked = () => reject(new Error('Crisis pack storage is blocked by another app window.'))
  })
}

function runTransaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDatabase().then((database) => new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(MAP_SNAPSHOT_STORE, mode)
    const request = operation(transaction.objectStore(MAP_SNAPSHOT_STORE))
    let result: T
    request.onsuccess = () => {
      result = request.result
    }
    transaction.oncomplete = () => {
      database.close()
      resolve(result)
    }
    transaction.onerror = () => {
      database.close()
      reject(transaction.error ?? new Error('Crisis pack storage could not be updated.'))
    }
    transaction.onabort = () => {
      database.close()
      reject(transaction.error ?? new Error('Crisis pack storage update was cancelled.'))
    }
  }))
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
/** Works across realms, where an ArrayBuffer read back from IndexedDB can fail instanceof. */
const isArrayBuffer = (value: unknown): value is ArrayBuffer => Object.prototype.toString.call(value) === '[object ArrayBuffer]'

function isSnapshot(value: unknown): value is StoredSnapshot {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<StoredSnapshot>
  return typeof record.placesKey === 'string'
    && typeof record.styleUrl === 'string'
    && typeof record.createdAt === 'string'
    && typeof record.attribution === 'string'
    && typeof record.imageType === 'string'
    && isArrayBuffer(record.imageBytes)
    && record.imageBytes.byteLength > 0
    && [record.width, record.height, record.pixelRatio, record.metersPerPixel, record.zoom, record.centerLatitude].every(isFiniteNumber)
    && (record.metersPerPixel as number) > 0
    && Array.isArray(record.positions)
    && record.positions.every((position) => typeof position?.key === 'string' && isFiniteNumber(position.x) && isFiniteNumber(position.y))
}

/** The stored street map, or null when there is none, it is unreadable, or storage is unavailable. */
export async function readCrisisPackMapSnapshot(): Promise<CrisisPackMapSnapshot | null> {
  try {
    const stored = await runTransaction<unknown>('readonly', (store) => store.get(CURRENT_SNAPSHOT_ID))
    if (!isSnapshot(stored)) return null
    const snapshot: Partial<StoredSnapshot> = { ...stored }
    delete snapshot.id
    return snapshot as CrisisPackMapSnapshot
  } catch {
    return null
  }
}

/** Replaces the stored street map; only one is kept. */
export async function saveCrisisPackMapSnapshot(snapshot: CrisisPackMapSnapshot): Promise<void> {
  const stored: StoredSnapshot = { ...snapshot, id: CURRENT_SNAPSHOT_ID }
  await runTransaction('readwrite', (store) => store.put(stored))
}

/** Resolves even when the deletion is blocked; the browser finishes it once other windows close their connection. */
export function deleteCrisisPackDatabase(): Promise<void> {
  if (!('indexedDB' in window)) return Promise.resolve()
  return new Promise<void>((resolve) => {
    const request = window.indexedDB.deleteDatabase(CRISIS_PACK_DATABASE_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })
}
