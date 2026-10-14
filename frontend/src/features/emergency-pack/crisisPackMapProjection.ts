/** Drawing size of the page 1 map in SVG units (16:10). Printed at full content width this is 0.5pt per unit. */
export const CRISIS_PACK_MAP_SIZE = { width: 1014, height: 634 } as const

const EARTH_CIRCUMFERENCE_M = 40_075_016.686
/** Keeps one place, or a few very close places, from being drawn at building scale. */
const MIN_SPAN_M = 1000
const SCALE_BAR_STEPS_M = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000, 20_000, 50_000, 100_000, 200_000]
const MAX_SPREAD_ITERATIONS = 24
/** Markers moved further than this get a line back to their true position. */
export const LEADER_LINE_MIN_PX = 6

export interface MapFrame {
  width: number
  height: number
  padding: number
}

export interface MapPointInput {
  id: string
  latitude: number
  longitude: number
}

export interface ProjectedPoint {
  id: string
  x: number
  y: number
}

export interface MapProjection {
  points: ProjectedPoint[]
  metersPerPixel: number
}

function mercatorX(longitude: number): number {
  return (longitude + 180) / 360
}

function mercatorY(latitude: number): number {
  const radians = (latitude * Math.PI) / 180
  return (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2
}

/** Web Mercator projection of the points, centred and scaled to fit inside the padded frame. */
export function projectToFrame(points: MapPointInput[], frame: MapFrame): MapProjection | null {
  if (points.length === 0) return null
  const world = points.map((point) => ({ id: point.id, x: mercatorX(point.longitude), y: mercatorY(point.latitude) }))
  const xs = world.map((point) => point.x)
  const ys = world.map((point) => point.y)
  const latitudes = points.map((point) => point.latitude)
  const centreLatitude = (Math.min(...latitudes) + Math.max(...latitudes)) / 2
  const metersPerWorldUnit = EARTH_CIRCUMFERENCE_M * Math.cos((centreLatitude * Math.PI) / 180)
  const minSpan = MIN_SPAN_M / metersPerWorldUnit
  const spanX = Math.max(Math.max(...xs) - Math.min(...xs), minSpan)
  const spanY = Math.max(Math.max(...ys) - Math.min(...ys), minSpan)
  const scale = Math.min((frame.width - 2 * frame.padding) / spanX, (frame.height - 2 * frame.padding) / spanY)
  const centreX = (Math.min(...xs) + Math.max(...xs)) / 2
  const centreY = (Math.min(...ys) + Math.max(...ys)) / 2

  return {
    points: world.map((point) => ({
      id: point.id,
      x: frame.width / 2 + (point.x - centreX) * scale,
      y: frame.height / 2 + (point.y - centreY) * scale,
    })),
    metersPerPixel: metersPerWorldUnit / scale,
  }
}

export interface ScaleBar {
  meters: number
  pixels: number
  label: string
}

/** The longest round distance that fits in maxPixels. */
export function scaleBarFor(metersPerPixel: number, maxPixels: number): ScaleBar {
  const meters = [...SCALE_BAR_STEPS_M].reverse().find((step) => step / metersPerPixel <= maxPixels) ?? SCALE_BAR_STEPS_M[0]
  return {
    meters,
    pixels: meters / metersPerPixel,
    label: meters < 1000 ? `${meters} m` : `${meters / 1000} km`,
  }
}

export interface SpreadPoint extends ProjectedPoint {
  anchorX: number
  anchorY: number
  /** True when the marker moved far enough to need a leader line. */
  hasLeader: boolean
}

/**
 * Pushes overlapping markers apart a little at a time, for a capped number of
 * rounds, and keeps them inside the frame. Deterministic for the same input.
 */
export function spreadMarkers(points: ProjectedPoint[], minDistance: number, frame: MapFrame): SpreadPoint[] {
  const placed = points.map((point) => ({ ...point, anchorX: point.x, anchorY: point.y }))
  const margin = minDistance / 2
  const clamp = (value: number, max: number) => Math.min(Math.max(value, margin), max - margin)

  for (let iteration = 0; iteration < MAX_SPREAD_ITERATIONS; iteration += 1) {
    let moved = false
    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        const a = placed[i]
        const b = placed[j]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const distance = Math.hypot(dx, dy)
        if (distance >= minDistance) continue
        // Markers on the same spot get pushed apart along a fixed angle per pair.
        const angle = (i + j) * 2.399963
        const unitX = distance > 0.01 ? dx / distance : Math.cos(angle)
        const unitY = distance > 0.01 ? dy / distance : Math.sin(angle)
        const push = (minDistance - distance) / 2
        a.x -= unitX * push
        a.y -= unitY * push
        b.x += unitX * push
        b.y += unitY * push
        moved = true
      }
    }
    for (const point of placed) {
      point.x = clamp(point.x, frame.width)
      point.y = clamp(point.y, frame.height)
    }
    if (!moved) break
  }

  return placed.map((point) => ({
    ...point,
    hasLeader: Math.hypot(point.x - point.anchorX, point.y - point.anchorY) > LEADER_LINE_MIN_PX,
  }))
}
