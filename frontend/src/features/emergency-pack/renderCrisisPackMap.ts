import type { Map as MapLibreMap, MapOptions, StyleSpecification } from 'maplibre-gl'
import { crisisPackMapPointKey, type CrisisPackMapPoint } from './crisisPackMapPoints'
import { CRISIS_PACK_MAP_SIZE } from './crisisPackMapProjection'

export const CRISIS_PACK_MAP_PIXEL_RATIO = 2
export const FALLBACK_MAP_ATTRIBUTION = '© OpenFreeMap © OpenMapTiles © OpenStreetMap contributors'

const RENDER_TIMEOUT_MS = 15_000
const FIT_PADDING_PX = 48
const MAX_ZOOM = 15
const SINGLE_PLACE_ZOOM = 14
/** Same minimum as the simplified map, so a few very close places are not shown at building scale. */
const MIN_SPAN_M = 1000
const EARTH_CIRCUMFERENCE_M = 40_075_016.686
const METERS_PER_DEGREE_LATITUDE = EARTH_CIRCUMFERENCE_M / 360
/** MapLibre's world is 512 CSS pixels wide at zoom 0. */
const MAPLIBRE_WORLD_SIZE_PX = 512

export type CrisisPackMapErrorCode =
  | 'no-points'
  | 'webgl-unavailable'
  | 'map-error'
  | 'timeout'
  | 'export-failed'
  | 'aborted'

export class CrisisPackMapError extends Error {
  readonly code: CrisisPackMapErrorCode

  constructor(code: CrisisPackMapErrorCode, cause?: unknown) {
    super(`Street map not made: ${code}`, { cause })
    this.name = 'CrisisPackMapError'
    this.code = code
  }
}

/** Where a place's marker goes, in CSS pixels of the map (the same units as the SVG viewBox). */
export interface CrisisPackMapPosition {
  key: string
  x: number
  y: number
}

export interface RenderedCrisisPackMap {
  image: Blob
  /** CSS pixel size of the map; the image itself is pixelRatio times larger. */
  width: number
  height: number
  pixelRatio: number
  positions: CrisisPackMapPosition[]
  metersPerPixel: number
  zoom: number
  centerLatitude: number
  attribution: string
}

export interface RenderCrisisPackMapOptions {
  styleUrl: string
  signal?: AbortSignal
  timeoutMs?: number
}

/** Ground distance of one CSS pixel at this MapLibre zoom and latitude. */
export function mapLibreMetersPerPixel(zoom: number, latitude: number): number {
  return (EARTH_CIRCUMFERENCE_M * Math.cos((latitude * Math.PI) / 180)) / (MAPLIBRE_WORLD_SIZE_PX * 2 ** zoom)
}

function htmlToText(html: string): string {
  const text = new DOMParser().parseFromString(html, 'text/html').body.textContent ?? ''
  return text.replace(/\s+/g, ' ').trim()
}

/** Plain-text attribution from the style's sources, or the OpenFreeMap credit when none is given. */
export function styleAttribution(style: Pick<StyleSpecification, 'sources'> | undefined): string {
  const parts = Object.values(style?.sources ?? {}).flatMap((source) => {
    const attribution = 'attribution' in source ? source.attribution : undefined
    return typeof attribution === 'string' ? [htmlToText(attribution)] : []
  })
  const unique = [...new Set(parts.filter(Boolean))]
  return unique.length > 0 ? unique.join(' ') : FALLBACK_MAP_ATTRIBUTION
}

function cameraFor(points: CrisisPackMapPoint[]): Pick<MapOptions, 'center' | 'zoom' | 'bounds' | 'fitBoundsOptions'> {
  if (points.length === 1) {
    return { center: [points[0].longitude, points[0].latitude], zoom: SINGLE_PLACE_ZOOM }
  }
  const latitudes = points.map((point) => point.latitude)
  const longitudes = points.map((point) => point.longitude)
  const centreLatitude = (Math.min(...latitudes) + Math.max(...latitudes)) / 2
  const centreLongitude = (Math.min(...longitudes) + Math.max(...longitudes)) / 2
  const minLatitudeSpan = MIN_SPAN_M / METERS_PER_DEGREE_LATITUDE
  const minLongitudeSpan = minLatitudeSpan / Math.cos((centreLatitude * Math.PI) / 180)
  const halfLatitude = Math.max(Math.max(...latitudes) - Math.min(...latitudes), minLatitudeSpan) / 2
  const halfLongitude = Math.max(Math.max(...longitudes) - Math.min(...longitudes), minLongitudeSpan) / 2
  return {
    bounds: [
      [centreLongitude - halfLongitude, centreLatitude - halfLatitude],
      [centreLongitude + halfLongitude, centreLatitude + halfLatitude],
    ],
    fitBoundsOptions: { padding: FIT_PADDING_PX, maxZoom: MAX_ZOOM },
  }
}

function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) throw new CrisisPackMapError('aborted')
}

function waitForIdle(map: MapLibreMap, signal: AbortSignal | undefined, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = (error?: CrisisPackMapError) => {
      window.clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      map.off('idle', onIdle)
      map.off('error', onError)
      if (error) reject(error)
      else resolve()
    }
    const onIdle = () => finish()
    // Any failed style, tile, glyph or sprite request would leave holes in the picture.
    const onError = (event: { error?: unknown }) => finish(new CrisisPackMapError('map-error', event.error))
    const onAbort = () => finish(new CrisisPackMapError('aborted'))
    const timer = window.setTimeout(() => finish(new CrisisPackMapError('timeout')), timeoutMs)
    map.on('idle', onIdle)
    map.on('error', onError)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Throws when the canvas is fully transparent (the drawing buffer was cleared)
 * or cannot be read (a SecurityError from a cross-origin source without CORS).
 * Skipped where there is no 2D canvas.
 */
function assertCanvasHasPixels(canvas: HTMLCanvasElement) {
  const sample = document.createElement('canvas')
  sample.width = 16
  sample.height = 10
  const context = sample.getContext('2d')
  if (!context) return
  context.drawImage(canvas, 0, 0, sample.width, sample.height)
  const { data } = context.getImageData(0, 0, sample.width, sample.height)
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] > 0) return
  }
  throw new Error('The map canvas is blank.')
}

function exportCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      assertCanvasHasPixels(canvas)
      canvas.toBlob((blob) => {
        if (blob && blob.size > 0) resolve(blob)
        else reject(new CrisisPackMapError('export-failed'))
      }, 'image/png')
    } catch (error) {
      reject(new CrisisPackMapError('export-failed', error))
    }
  })
}

/**
 * Draws the saved places' area with MapLibre in a hidden, throwaway map and
 * returns it as a PNG with each place's position. Nothing is stored here.
 * Rejects with a CrisisPackMapError; the map and its container are always removed.
 */
export async function renderCrisisPackMap(
  points: CrisisPackMapPoint[],
  { styleUrl, signal, timeoutMs = RENDER_TIMEOUT_MS }: RenderCrisisPackMapOptions,
): Promise<RenderedCrisisPackMap> {
  if (points.length === 0) throw new CrisisPackMapError('no-points')
  throwIfAborted(signal)
  const { MapLibreMap } = await import('./crisisPackMapLibre')
  throwIfAborted(signal)

  const { width, height } = CRISIS_PACK_MAP_SIZE
  const container = document.createElement('div')
  container.setAttribute('aria-hidden', 'true')
  Object.assign(container.style, {
    position: 'fixed',
    top: '0',
    left: '-10000px',
    width: `${width}px`,
    height: `${height}px`,
    pointerEvents: 'none',
  })
  document.body.append(container)

  let map: MapLibreMap | undefined
  try {
    try {
      map = new MapLibreMap({
        container,
        style: styleUrl,
        ...cameraFor(points),
        interactive: false,
        attributionControl: false,
        fadeDuration: 0,
        pixelRatio: CRISIS_PACK_MAP_PIXEL_RATIO,
        canvasContextAttributes: { preserveDrawingBuffer: true },
      })
    } catch (error) {
      throw new CrisisPackMapError('webgl-unavailable', error)
    }

    await waitForIdle(map, signal, timeoutMs)
    const loadedMap = map
    const positions = points.map((point) => {
      const { x, y } = loadedMap.project([point.longitude, point.latitude])
      return { key: crisisPackMapPointKey(point), x, y }
    })
    const zoom = map.getZoom()
    const centerLatitude = map.getCenter().lat
    const attribution = styleAttribution(map.getStyle())
    const image = await exportCanvas(map.getCanvas())
    throwIfAborted(signal)

    return {
      image,
      width,
      height,
      pixelRatio: CRISIS_PACK_MAP_PIXEL_RATIO,
      positions,
      metersPerPixel: mapLibreMetersPerPixel(zoom, centerLatitude),
      zoom,
      centerLatitude,
      attribution,
    }
  } finally {
    map?.remove()
    container.remove()
  }
}
