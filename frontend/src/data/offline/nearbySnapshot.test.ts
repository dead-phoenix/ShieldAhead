import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { storageKeys } from '../../app/config/product'
import { saveMyArea } from '../../storage/myAreaStorage'
import { fixtureBundle, fixtureFetch, fixtureFiles } from '../../test/nearbyFixtures'
import {
  buildNearbySnapshot,
  readNearbySnapshot,
  refreshNearbySnapshot,
  snapshotMatchesArea,
} from './nearbySnapshot'
import { loadOfflineDataBundle, lookupLocalities } from './offlineDataLoader'

vi.mock('../preloadNearbyData', () => ({ preloadNearbyData: vi.fn() }))

const harcourt = { postcode: '3453', localityId: 'loc-harcourt', localityName: 'Harcourt', label: 'Harcourt 3453', savedAt: '' }

function setArea(area: object) {
  window.localStorage.setItem(storageKeys.myArea, JSON.stringify(area))
}

describe('offline data loader', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('fetches only the five /data/*.json files and joins their versions in a fixed order', async () => {
    const requested: string[] = []
    vi.stubGlobal('fetch', vi.fn(fixtureFetch(requested)))

    const bundle = await loadOfflineDataBundle()

    expect(bundle.dataVersion).toBe('wifi1.char1.emer1.post1.loc1')
    expect(requested.sort()).toEqual([
      '/data/localities.json',
      '/data/offline-charities.json',
      '/data/offline-emergency-services.json',
      '/data/offline-wifi.json',
      '/data/postcodes.json',
    ])
  })

  it('rejects a file with an unknown schemaVersion', async () => {
    const serve = fixtureFetch()
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('postcodes.json')) {
        return new Response(JSON.stringify({ ...fixtureFiles['postcodes.json'], schemaVersion: 2 }))
      }
      return serve(input)
    }))

    await expect(loadOfflineDataBundle()).rejects.toThrow(/supported format/)
  })

  it('lists the localities for a postcode, or null when the file cannot be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn(fixtureFetch()))
    expect((await lookupLocalities('3453'))?.map((item) => item.name)).toEqual(['Harcourt', 'Harcourt North'])
    expect(await lookupLocalities('3000')).toEqual([])

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    expect(await lookupLocalities('3453')).toBeNull()
  })
})

describe('buildNearbySnapshot', () => {
  it('ranks services from the locality centre and records both version fields', () => {
    const snapshot = buildNearbySnapshot(harcourt, fixtureBundle(), '2026-10-08T06:00:00.000Z')

    expect(snapshot.snapshotVersion).toBe(1)
    expect(snapshot.schemaVersion).toBe(1)
    expect(snapshot.dataVersion).toBe('wifi1.char1.emer1.post1.loc1')
    expect(snapshot.originPoint).toEqual({ lat: -36.9934, lng: 144.2583 })
    expect(snapshot.originInRegion).toBe(true)
    expect(snapshot.originLabel).toBe('Harcourt 3453')
    expect(snapshot.nearest.fire?.[0].id).toBe('f-harcourt')
    expect(snapshot.records).toHaveLength(6)
    expect(snapshotMatchesArea(snapshot, harcourt)).toBe(true)
    expect(snapshotMatchesArea(snapshot, { ...harcourt, localityId: 'loc-harcourt-north' })).toBe(false)
  })

  it('falls back to the postcode centre and keeps no list for an area outside the region', () => {
    const snapshot = buildNearbySnapshot({ postcode: '3000', label: '3000', savedAt: '' }, fixtureBundle())

    expect(snapshot.originPoint).toEqual({ lat: -37.8132, lng: 144.9624 })
    expect(snapshot.originInRegion).toBe(false)
    expect(snapshot.nearest).toEqual({})
    expect(snapshot.records).toHaveLength(6)
  })
})

describe('readNearbySnapshot', () => {
  it('treats an unknown snapshotVersion or unreadable value as no snapshot', () => {
    const snapshot = buildNearbySnapshot(harcourt, fixtureBundle())
    window.localStorage.setItem(storageKeys.nearbySnapshot, JSON.stringify(snapshot))
    expect(readNearbySnapshot()?.originPostcode).toBe('3453')

    window.localStorage.setItem(storageKeys.nearbySnapshot, JSON.stringify({ ...snapshot, snapshotVersion: 2 }))
    expect(readNearbySnapshot()).toBeNull()

    window.localStorage.setItem(storageKeys.nearbySnapshot, '{not json')
    expect(readNearbySnapshot()).toBeNull()
  })
})

describe('refreshNearbySnapshot', () => {
  beforeEach(() => setArea(harcourt))
  afterEach(() => vi.unstubAllGlobals())

  it('saves a snapshot for My area', async () => {
    vi.stubGlobal('fetch', vi.fn(fixtureFetch()))

    await expect(refreshNearbySnapshot()).resolves.toBe('saved')
    expect(readNearbySnapshot()).toMatchObject({ originPostcode: '3453', originLocalityId: 'loc-harcourt' })
  })

  it('never deletes or overwrites a good snapshot when the data fails to load', async () => {
    const good = buildNearbySnapshot(harcourt, fixtureBundle(), '2026-10-01T00:00:00.000Z')
    const stored = JSON.stringify(good)
    window.localStorage.setItem(storageKeys.nearbySnapshot, stored)
    setArea({ postcode: '3550', label: 'Bendigo 3550', localityId: 'loc-bendigo', savedAt: '' })
    const serve = fixtureFetch()
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => (
      String(input).endsWith('offline-wifi.json') ? new Response('', { status: 503 }) : serve(input)
    )))

    await expect(refreshNearbySnapshot()).rejects.toThrow()
    expect(window.localStorage.getItem(storageKeys.nearbySnapshot)).toBe(stored)
  })

  it('runs one build at a time and discards a build whose My area changed meanwhile', async () => {
    const requested: string[] = []
    const serve = fixtureFetch(requested)
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const response = await serve(input)
      if (requested.length <= 5) await gate
      return response
    }))

    const first = refreshNearbySnapshot()
    await vi.waitFor(() => expect(requested).toHaveLength(5))
    saveMyArea({ postcode: '3550', localityId: 'loc-bendigo', localityName: 'Bendigo' })
    const second = refreshNearbySnapshot()
    const third = refreshNearbySnapshot()

    expect(third).toBe(second)
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(requested).toHaveLength(5)
    expect(readNearbySnapshot()).toBeNull()

    release()
    await expect(first).resolves.toBe('discarded')
    await expect(second).resolves.toBe('saved')
    expect(requested).toHaveLength(10)
    expect(readNearbySnapshot()).toMatchObject({ originPostcode: '3550', originLabel: 'Bendigo 3550' })
  })
})
