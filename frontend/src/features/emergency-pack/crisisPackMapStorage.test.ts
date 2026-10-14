import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CRISIS_PACK_DATABASE_NAME,
  deleteCrisisPackDatabase,
  readCrisisPackMapSnapshot,
  saveCrisisPackMapSnapshot,
  type CrisisPackMapSnapshot,
} from './crisisPackMapStorage'

const originalIndexedDb = Object.getOwnPropertyDescriptor(window, 'indexedDB')

function snapshot(overrides: Partial<CrisisPackMapSnapshot> = {}): CrisisPackMapSnapshot {
  return {
    placesKey: 'style|wifi:w1@-37.000000,144.250000',
    styleUrl: 'style',
    createdAt: '2026-10-14T11:00:00.000Z',
    attribution: '© OpenFreeMap © OpenMapTiles © OpenStreetMap contributors',
    width: 1014,
    height: 634,
    pixelRatio: 2,
    imageType: 'image/png',
    imageBytes: new Uint8Array([137, 80, 78, 71]).buffer,
    positions: [{ key: 'wifi:w1', x: 507, y: 317 }],
    metersPerPixel: 3.8,
    zoom: 14,
    centerLatitude: -37,
    ...overrides,
  }
}

describe('crisis pack map storage', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'indexedDB', { configurable: true, value: new IDBFactory() })
  })

  afterEach(() => {
    if (originalIndexedDb) Object.defineProperty(window, 'indexedDB', originalIndexedDb)
    else Reflect.deleteProperty(window, 'indexedDB')
  })

  it('saves one street map in its own database and reads it back', async () => {
    expect(await readCrisisPackMapSnapshot()).toBeNull()
    await saveCrisisPackMapSnapshot(snapshot())

    const stored = await readCrisisPackMapSnapshot()
    const { imageBytes: _expectedBytes, ...expected } = snapshot()
    expect(stored).toMatchObject(expected)
    expect(stored && [...new Uint8Array(stored.imageBytes)]).toEqual([137, 80, 78, 71])
    expect(stored).not.toHaveProperty('id')
    expect((await window.indexedDB.databases()).map((database) => database.name)).toEqual([CRISIS_PACK_DATABASE_NAME])
  })

  it('keeps only the latest street map', async () => {
    await saveCrisisPackMapSnapshot(snapshot())
    await saveCrisisPackMapSnapshot(snapshot({ placesKey: 'style|charity:c1@-37.010000,144.260000' }))
    expect((await readCrisisPackMapSnapshot())?.placesKey).toBe('style|charity:c1@-37.010000,144.260000')
  })

  it('ignores a damaged record', async () => {
    await saveCrisisPackMapSnapshot(snapshot({ metersPerPixel: Number.NaN }))
    expect(await readCrisisPackMapSnapshot()).toBeNull()
    await saveCrisisPackMapSnapshot(snapshot({ imageBytes: new ArrayBuffer(0) }))
    expect(await readCrisisPackMapSnapshot()).toBeNull()
  })

  it('reads nothing when IndexedDB is unavailable', async () => {
    Reflect.deleteProperty(window, 'indexedDB')
    expect(await readCrisisPackMapSnapshot()).toBeNull()
    await expect(deleteCrisisPackDatabase()).resolves.toBeUndefined()
  })

  it('deletes the whole database', async () => {
    await saveCrisisPackMapSnapshot(snapshot())
    await deleteCrisisPackDatabase()
    expect(await window.indexedDB.databases()).toEqual([])
    expect(await readCrisisPackMapSnapshot()).toBeNull()
  })
})
