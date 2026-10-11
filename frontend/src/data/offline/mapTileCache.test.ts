import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cacheMapTilesForArea, MAP_TILE_CACHE_NAME } from './mapTileCache'

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'
const TILEJSON_URL = 'https://tiles.openfreemap.org/planet'
const TILE_TEMPLATE = 'https://tiles.openfreemap.org/planet/stamp/{z}/{x}/{y}.pbf'

const style = {
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sprite: 'https://tiles.openfreemap.org/sprites/ofm_f384/ofm',
  sources: { openmaptiles: { type: 'vector', url: TILEJSON_URL } },
  layers: [{ layout: { 'text-font': ['Noto Sans Regular'] } }],
}

const tileJson = { tiles: [TILE_TEMPLATE] }

// A tiny single-point box — tilesForBbox/pickZoomLevels are covered by
// mapTileMath.test.ts, so this only needs to be small and deterministic.
const TINY_BBOX: [number, number, number, number] = [144.001, -36.999, 144.002, -36.998]

function fakeCache() {
  const store = new Map<string, Response>()
  return {
    store,
    put: vi.fn(async (request: string, response: Response) => {
      store.set(request, response)
    }),
    match: vi.fn(async (request: string) => store.get(request)),
  }
}

function stubCaches(cache: ReturnType<typeof fakeCache>) {
  vi.stubGlobal('caches', {
    delete: vi.fn().mockResolvedValue(true),
    open: vi.fn().mockResolvedValue(cache),
  })
}

/** Every fetch gets its own fresh Response — cache.put() and our own
 * .clone().json() read each consume a body, so a shared instance would
 * throw "body already used" on the second read. */
function stubFetch(handler: (url: string) => { ok: boolean; body?: unknown } | null) {
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = typeof input === 'string' ? input : String(input)
    const result = handler(url)
    if (!result) return new Response('not found', { status: 404 })
    return new Response(result.body === undefined ? '' : JSON.stringify(result.body), { status: result.ok ? 200 : 404 })
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('cacheMapTilesForArea', () => {
  it('caches the style, TileJSON, sprite, glyphs and vector tiles, reporting ready', async () => {
    const cache = fakeCache()
    stubCaches(cache)
    stubFetch((url) => {
      if (url === STYLE_URL) return { ok: true, body: style }
      if (url === TILEJSON_URL) return { ok: true, body: tileJson }
      return { ok: true, body: '' } // sprite / glyph / tile requests — any 2xx body is fine
    })

    const result = await cacheMapTilesForArea(TINY_BBOX)

    expect(result.status).toBe('ready')
    expect(result.tilesFailed).toBe(0)
    expect(result.tilesCached).toBeGreaterThan(0)
    expect(caches.delete).toHaveBeenCalledWith(MAP_TILE_CACHE_NAME)
    expect(cache.store.has(STYLE_URL)).toBe(true)
    expect(cache.store.has(TILEJSON_URL)).toBe(true)
    expect(cache.store.has('https://tiles.openfreemap.org/sprites/ofm_f384/ofm.json')).toBe(true)
    expect(cache.store.has('https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/0-255.pbf')).toBe(true)
    expect([...cache.store.keys()].some((key) => key.includes('/planet/stamp/'))).toBe(true)
  })

  it('reports not-ready when the style document itself cannot be fetched', async () => {
    const cache = fakeCache()
    stubCaches(cache)
    stubFetch(() => ({ ok: false }))

    const result = await cacheMapTilesForArea(TINY_BBOX)

    expect(result.status).toBe('not-ready')
    expect(result.tilesCached).toBe(0)
  })

  it('reports not-ready when the style has no usable vector tile source', async () => {
    const cache = fakeCache()
    stubCaches(cache)
    stubFetch((url) => {
      if (url === STYLE_URL) return { ok: true, body: { ...style, sources: {} } }
      return { ok: true, body: '' }
    })

    const result = await cacheMapTilesForArea(TINY_BBOX)

    expect(result.status).toBe('not-ready')
  })

  it('reports partial when some tiles fail but others are cached', async () => {
    const cache = fakeCache()
    stubCaches(cache)
    let tileCall = 0
    stubFetch((url) => {
      if (url === STYLE_URL) return { ok: true, body: style }
      if (url === TILEJSON_URL) return { ok: true, body: tileJson }
      if (url.includes('/planet/stamp/')) {
        tileCall++
        return tileCall === 1 ? { ok: false } : { ok: true, body: '' }
      }
      return { ok: true, body: '' }
    })

    const result = await cacheMapTilesForArea(TINY_BBOX)

    expect(result.status).toBe('partial')
    expect(result.tilesFailed).toBeGreaterThan(0)
    expect(result.tilesCached).toBeGreaterThan(0)
  })

  it('deletes any previous tile cache before rebuilding, rather than reconciling it', async () => {
    const cache = fakeCache()
    stubCaches(cache)
    stubFetch((url) => (url === STYLE_URL ? { ok: true, body: style } : url === TILEJSON_URL ? { ok: true, body: tileJson } : { ok: true, body: '' }))

    await cacheMapTilesForArea(TINY_BBOX)

    expect(caches.delete).toHaveBeenCalledWith(MAP_TILE_CACHE_NAME)
    const deleteOrder = vi.mocked(caches.delete).mock.invocationCallOrder[0]
    const openOrder = vi.mocked(caches.open).mock.invocationCallOrder[0]
    expect(deleteOrder).toBeLessThan(openOrder)
  })
})
