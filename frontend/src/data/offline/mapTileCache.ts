import { resolveMapStyleUrl } from '../../shared/map/mapStyleUrl'
import { pickZoomLevels, tilesForBbox } from './mapTileMath'

export const MAP_TILE_CACHE_NAME = 'shieldahead-tiles-v1'

/** How many tile requests run at once — bounded so a large area doesn't
 * fire hundreds of simultaneous fetches. */
const TILE_FETCH_BATCH_SIZE = 6
/** Font stacks the OpenFreeMap "liberty" style actually uses in its
 * layers (checked directly against the live style). A style layer whose
 * text-font isn't cached here simply renders without a glyph — a missing
 * label, not an error. */
const GLYPH_FONT_STACKS = ['Noto Sans Regular', 'Noto Sans Bold', 'Noto Sans Italic']
/** Basic Latin, Latin-1 Supplement, Latin Extended-A, General
 * Punctuation — covers ordinary English place names plus the one
 * non-ASCII character (a curly apostrophe) found anywhere in this app's
 * own offline data. */
const GLYPH_RANGES = [0, 256, 512, 8192]

export interface MapTileCacheResult {
  status: 'ready' | 'partial' | 'not-ready'
  tilesCached: number
  tilesFailed: number
}

interface StyleSource {
  type: string
  url?: string
  tiles?: string[]
}

interface StyleJson {
  glyphs?: string
  sprite?: string
  sources: Record<string, StyleSource>
  layers: { layout?: { 'text-font'?: string[] } }[]
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size))
  return chunks
}

async function cacheUrl(cache: Cache, url: string): Promise<boolean> {
  try {
    const response = await fetch(url)
    if (!response.ok) return false
    await cache.put(url, response)
    return true
  } catch {
    return false
  }
}

async function cacheUrlsInBatches(cache: Cache, urls: readonly string[]): Promise<{ succeeded: number; failed: number }> {
  let succeeded = 0
  let failed = 0
  for (const batch of chunk(urls, TILE_FETCH_BATCH_SIZE)) {
    const results = await Promise.allSettled(batch.map((url) => cacheUrl(cache, url)))
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) succeeded++
      else failed++
    }
  }
  return { succeeded, failed }
}

function vectorTileUrlTemplates(sources: Record<string, StyleSource>, tileJsonBySource: Map<string, { tiles: string[] }>): string[] {
  const templates: string[] = []
  for (const [name, source] of Object.entries(sources)) {
    if (source.type !== 'vector') continue
    if (source.tiles) templates.push(...source.tiles)
    else {
      const tileJson = tileJsonBySource.get(name)
      if (tileJson) templates.push(...tileJson.tiles)
    }
  }
  return templates
}

function spriteUrls(spriteBase: string): string[] {
  return [`${spriteBase}.json`, `${spriteBase}.png`, `${spriteBase}@2x.json`, `${spriteBase}@2x.png`]
}

function glyphUrls(glyphsTemplate: string, fontStacks: readonly string[]): string[] {
  const urls: string[] = []
  for (const fontstack of fontStacks) {
    for (const start of GLYPH_RANGES) {
      const range = `${start}-${start + 255}`
      urls.push(glyphsTemplate.replace('{fontstack}', encodeURIComponent(fontstack)).replace('{range}', range))
    }
  }
  return urls
}

function usedFontStacks(layers: StyleJson['layers']): string[] {
  const used = new Set<string>()
  for (const layer of layers) {
    for (const stack of layer.layout?.['text-font'] ?? []) used.add(stack)
  }
  const matched = GLYPH_FONT_STACKS.filter((stack) => used.has(stack))
  return matched.length > 0 ? matched : GLYPH_FONT_STACKS
}

function tileUrl(template: string, z: number, x: number, y: number): string {
  return template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))
}

/**
 * Caches only what's needed to render the map for one local area offline:
 * the style document, its vector tile source(s), sprite, a small set of
 * glyph ranges, and the vector tiles covering bbox at a budget-limited
 * zoom range. Always rebuilds from scratch (the OpenFreeMap tile URL
 * template includes a version stamp that rotates periodically, so
 * yesterday's cached tiles can't be reconciled against today's style —
 * simplest correct behaviour is a full replace on every save).
 */
export async function cacheMapTilesForArea(bbox: [number, number, number, number]): Promise<MapTileCacheResult> {
  await caches.delete(MAP_TILE_CACHE_NAME)
  const cache = await caches.open(MAP_TILE_CACHE_NAME)

  const styleUrl = resolveMapStyleUrl()
  let style: StyleJson
  try {
    const response = await fetch(styleUrl)
    if (!response.ok) return { status: 'not-ready', tilesCached: 0, tilesFailed: 0 }
    style = await response.clone().json() as StyleJson
    await cache.put(styleUrl, response)
  } catch {
    return { status: 'not-ready', tilesCached: 0, tilesFailed: 0 }
  }

  const tileJsonBySource = new Map<string, { tiles: string[] }>()
  for (const [name, source] of Object.entries(style.sources)) {
    if (source.type !== 'vector' || !source.url) continue
    try {
      const response = await fetch(source.url)
      if (!response.ok) continue
      const tileJson = await response.clone().json() as { tiles: string[] }
      await cache.put(source.url, response)
      tileJsonBySource.set(name, tileJson)
    } catch {
      // That source's tiles simply won't be available offline.
    }
  }

  const templates = vectorTileUrlTemplates(style.sources, tileJsonBySource)
  if (templates.length === 0) return { status: 'not-ready', tilesCached: 0, tilesFailed: 0 }

  const supportUrls = [
    ...(style.sprite ? spriteUrls(style.sprite) : []),
    ...(style.glyphs ? glyphUrls(style.glyphs, usedFontStacks(style.layers)) : []),
  ]
  const supportResult = await cacheUrlsInBatches(cache, supportUrls)

  const zoomLevels = pickZoomLevels(bbox)
  const tileUrls = templates.flatMap((template) =>
    zoomLevels.flatMap((zoom) => tilesForBbox(bbox, zoom).map((tile) => tileUrl(template, tile.z, tile.x, tile.y))),
  )
  const tileResult = await cacheUrlsInBatches(cache, tileUrls)

  const tilesCached = supportResult.succeeded + tileResult.succeeded
  const tilesFailed = supportResult.failed + tileResult.failed
  return {
    status: tileResult.succeeded > 0 ? (tilesFailed > 0 ? 'partial' : 'ready') : 'not-ready',
    tilesCached,
    tilesFailed,
  }
}
