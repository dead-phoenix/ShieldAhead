import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CrisisPackMapPoint } from './crisisPackMapPoints'
import {
  CrisisPackMapError,
  FALLBACK_MAP_ATTRIBUTION,
  mapLibreMetersPerPixel,
  renderCrisisPackMap,
  styleAttribution,
} from './renderCrisisPackMap'

type Listener = (event: { error?: unknown }) => void

const fake = vi.hoisted(() => {
  const state = {
    instances: [] as FakeMap[],
    autoIdle: true,
    throwOnCreate: false,
    toBlob: (callback: (blob: Blob | null) => void) => callback(new Blob(['png'], { type: 'image/png' })),
    style: { version: 8, sources: {}, layers: [] } as { version: number; sources: Record<string, unknown>; layers: unknown[] },
  }

  class FakeMap {
    options: Record<string, unknown>
    listeners = new Map<string, Set<Listener>>()
    removed = false
    canvas = { toBlob: (callback: (blob: Blob | null) => void) => state.toBlob(callback) }

    constructor(options: Record<string, unknown>) {
      if (state.throwOnCreate) throw new Error('Failed to initialize WebGL')
      this.options = options
      state.instances.push(this)
      if (state.autoIdle) queueMicrotask(() => this.fire('idle'))
    }

    on(type: string, listener: Listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set())
      this.listeners.get(type)?.add(listener)
      return this
    }

    off(type: string, listener: Listener) {
      this.listeners.get(type)?.delete(listener)
      return this
    }

    fire(type: string, event: { error?: unknown } = {}) {
      for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event)
    }

    project([longitude, latitude]: [number, number]) {
      return { x: Math.round((longitude - 144) * 1000), y: Math.round((-36 - latitude) * 1000) }
    }

    getZoom() {
      return 13.5
    }

    getCenter() {
      return { lat: -37, lng: 144.26 }
    }

    getStyle() {
      return state.style
    }

    getCanvas() {
      return this.canvas
    }

    remove() {
      this.removed = true
    }
  }

  return { state, FakeMap }
})

vi.mock('./crisisPackMapLibre', () => ({ MapLibreMap: fake.FakeMap }))

const STYLE_URL = 'https://tiles.example/styles/test'

const points: CrisisPackMapPoint[] = [
  { id: 'w1', kind: 'wifi', label: 'W1', latitude: -37.0, longitude: 144.25 },
  { id: 'c1', kind: 'charity', label: 'C1', latitude: -37.02, longitude: 144.27 },
]

function lastMap() {
  return fake.state.instances[fake.state.instances.length - 1]
}

async function failureCode(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (reason: unknown) => reason)
  expect(error).toBeInstanceOf(CrisisPackMapError)
  return (error as CrisisPackMapError).code
}

describe('renderCrisisPackMap', () => {
  beforeEach(() => {
    fake.state.instances = []
    fake.state.autoIdle = true
    fake.state.throwOnCreate = false
    fake.state.toBlob = (callback) => callback(new Blob(['png'], { type: 'image/png' }))
    fake.state.style = { version: 8, sources: {}, layers: [] }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('makes a hidden, non-interactive map that keeps its drawing buffer, and returns the PNG, positions and scale', async () => {
    fake.state.style = {
      version: 8,
      layers: [],
      sources: {
        openmaptiles: {
          type: 'vector',
          attribution: '<a href="https://openfreemap.org">OpenFreeMap</a> <a href="https://www.openmaptiles.org/">&copy; OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        },
      },
    }

    const result = await renderCrisisPackMap(points, { styleUrl: STYLE_URL })
    const map = lastMap()

    expect(map.options).toMatchObject({
      style: STYLE_URL,
      interactive: false,
      attributionControl: false,
      pixelRatio: 2,
      canvasContextAttributes: { preserveDrawingBuffer: true },
      fitBoundsOptions: { padding: 48, maxZoom: 15 },
    })
    const container = map.options.container as HTMLElement
    expect(container).toHaveAttribute('aria-hidden', 'true')
    expect(container.style.width).toBe('1014px')
    expect(container.style.height).toBe('634px')
    expect(document.body.contains(container)).toBe(false)
    expect(map.removed).toBe(true)

    expect(result.image.type).toBe('image/png')
    expect(result).toMatchObject({ width: 1014, height: 634, pixelRatio: 2, zoom: 13.5, centerLatitude: -37 })
    expect(result.positions).toEqual([
      { key: 'wifi:w1', x: 250, y: 1000 },
      { key: 'charity:c1', x: 270, y: 1020 },
    ])
    expect(result.metersPerPixel).toBeCloseTo(mapLibreMetersPerPixel(13.5, -37), 9)
    expect(result.attribution).toBe('OpenFreeMap © OpenMapTiles Data from OpenStreetMap')
  })

  it('shows a single place at zoom 14, centred on it', async () => {
    await renderCrisisPackMap([points[0]], { styleUrl: STYLE_URL })
    expect(lastMap().options).toMatchObject({ center: [144.25, -37.0], zoom: 14 })
    expect(lastMap().options.bounds).toBeUndefined()
  })

  it('widens the bounds of very close places to at least 1 km each way', async () => {
    await renderCrisisPackMap([
      { id: 'w1', kind: 'wifi', label: 'W1', latitude: -37.0, longitude: 144.25 },
      { id: 'w2', kind: 'wifi', label: 'W2', latitude: -37.0001, longitude: 144.2501 },
    ], { styleUrl: STYLE_URL })
    const [[west, south], [east, north]] = lastMap().options.bounds as [[number, number], [number, number]]
    const metersPerDegree = 40_075_016.686 / 360
    expect((north - south) * metersPerDegree).toBeCloseTo(1000, 3)
    expect((east - west) * metersPerDegree * Math.cos((-37.00005 * Math.PI) / 180)).toBeCloseTo(1000, 3)
  })

  it('turns a SecurityError from toBlob into export-failed and still removes the map', async () => {
    fake.state.toBlob = () => {
      throw new DOMException('Tainted canvases may not be exported.', 'SecurityError')
    }
    expect(await failureCode(renderCrisisPackMap(points, { styleUrl: STYLE_URL }))).toBe('export-failed')
    expect(lastMap().removed).toBe(true)
    expect(document.body.contains(lastMap().options.container as HTMLElement)).toBe(false)
  })

  it('treats an empty toBlob result as export-failed', async () => {
    fake.state.toBlob = (callback) => callback(null)
    expect(await failureCode(renderCrisisPackMap(points, { styleUrl: STYLE_URL }))).toBe('export-failed')
  })

  it('treats a blank canvas as export-failed', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
      getImageData: () => ({ data: new Uint8ClampedArray(16 * 10 * 4) }),
    } as unknown as CanvasRenderingContext2D)
    expect(await failureCode(renderCrisisPackMap(points, { styleUrl: STYLE_URL }))).toBe('export-failed')
  })

  it('fails on any map error, such as a blocked tile, and removes the map', async () => {
    fake.state.autoIdle = false
    const render = renderCrisisPackMap(points, { styleUrl: STYLE_URL })
    await vi.waitFor(() => expect(fake.state.instances).toHaveLength(1))
    lastMap().fire('error', { error: new Error('Failed to fetch') })
    expect(await failureCode(render)).toBe('map-error')
    expect(lastMap().removed).toBe(true)
  })

  it('gives up after the timeout', async () => {
    fake.state.autoIdle = false
    expect(await failureCode(renderCrisisPackMap(points, { styleUrl: STYLE_URL, timeoutMs: 20 }))).toBe('timeout')
    expect(lastMap().removed).toBe(true)
  })

  it('stops when aborted', async () => {
    fake.state.autoIdle = false
    const controller = new AbortController()
    const render = renderCrisisPackMap(points, { styleUrl: STYLE_URL, signal: controller.signal })
    await vi.waitFor(() => expect(fake.state.instances).toHaveLength(1))
    controller.abort()
    expect(await failureCode(render)).toBe('aborted')
    expect(lastMap().removed).toBe(true)
  })

  it('reports webgl-unavailable when MapLibre cannot start', async () => {
    fake.state.throwOnCreate = true
    expect(await failureCode(renderCrisisPackMap(points, { styleUrl: STYLE_URL }))).toBe('webgl-unavailable')
    expect(document.querySelectorAll('[aria-hidden="true"][style*="-10000px"]')).toHaveLength(0)
  })

  it('does not start a map without points', async () => {
    expect(await failureCode(renderCrisisPackMap([], { styleUrl: STYLE_URL }))).toBe('no-points')
    expect(fake.state.instances).toHaveLength(0)
  })
})

describe('mapLibreMetersPerPixel', () => {
  it('uses MapLibre’s 512 px world at the given zoom and latitude', () => {
    expect(mapLibreMetersPerPixel(0, 0)).toBeCloseTo(40_075_016.686 / 512, 6)
    expect(mapLibreMetersPerPixel(14, -37)).toBeCloseTo(3.815, 3)
    expect(mapLibreMetersPerPixel(15, -37)).toBeCloseTo(mapLibreMetersPerPixel(14, -37) / 2, 9)
  })
})

describe('styleAttribution', () => {
  it('falls back to the OpenFreeMap credit when the style has none', () => {
    expect(styleAttribution(undefined)).toBe(FALLBACK_MAP_ATTRIBUTION)
    expect(styleAttribution({ sources: { a: { type: 'vector' } } })).toBe(FALLBACK_MAP_ATTRIBUTION)
  })

  it('removes duplicates across sources', () => {
    expect(styleAttribution({
      sources: {
        a: { type: 'vector', attribution: '&copy; OSM' },
        b: { type: 'raster', attribution: '<b>&copy; OSM</b>' },
      },
    })).toBe('© OSM')
  })
})
