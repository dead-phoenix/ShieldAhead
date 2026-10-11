/** Standard slippy-map (XYZ) tile numbering — see
 * https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames */

export interface TileCoord {
  z: number
  x: number
  y: number
}

/** Candidate zoom levels for an offline area, highest detail last — matches
 * the online map's own MIN_AUTOFIT_ZOOM (12) at the low end. */
const CANDIDATE_ZOOMS = [12, 13, 14, 15]

export function tileForPoint(lng: number, lat: number, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom
  const latRad = (lat * Math.PI) / 180
  const x = Math.floor(((lng + 180) / 360) * n)
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n)
  const clamp = (value: number) => Math.min(Math.max(value, 0), n - 1)
  return { x: clamp(x), y: clamp(y) }
}

// Latitude and tile-y both increase in opposite directions (y grows
// southward), so the north edge (maxLat) gives the smaller y.
function tileCorners(bbox: readonly [number, number, number, number], zoom: number) {
  const [minLng, minLat, maxLng, maxLat] = bbox
  return { topLeft: tileForPoint(minLng, maxLat, zoom), bottomRight: tileForPoint(maxLng, minLat, zoom) }
}

/** The tile count at one zoom, computed from the corner indices alone —
 * never materializes the tile list, so a very wide bbox (checked before a
 * smaller zoom is chosen) can't exhaust memory building a huge array. */
function tileCountForZoom(bbox: readonly [number, number, number, number], zoom: number): number {
  const { topLeft, bottomRight } = tileCorners(bbox, zoom)
  return (bottomRight.x - topLeft.x + 1) * (bottomRight.y - topLeft.y + 1)
}

/** Every tile covering bbox ([minLng, minLat, maxLng, maxLat]) at one zoom. */
export function tilesForBbox(bbox: readonly [number, number, number, number], zoom: number): TileCoord[] {
  const { topLeft, bottomRight } = tileCorners(bbox, zoom)
  const tiles: TileCoord[] = []
  for (let x = topLeft.x; x <= bottomRight.x; x++) {
    for (let y = topLeft.y; y <= bottomRight.y; y++) {
      tiles.push({ z: zoom, x, y })
    }
  }
  return tiles
}

function tileCount(bbox: readonly [number, number, number, number], zooms: readonly number[]): number {
  return zooms.reduce((total, zoom) => total + tileCountForZoom(bbox, zoom), 0)
}

/** Zoom levels to cache for bbox, trimmed from the highest detail down
 * until the total tile count fits within maxTiles. Always keeps at least
 * the lowest candidate zoom, even if that alone exceeds the budget. */
export function pickZoomLevels(bbox: readonly [number, number, number, number], maxTiles = 400): number[] {
  const zooms = [...CANDIDATE_ZOOMS]
  while (zooms.length > 1 && tileCount(bbox, zooms) > maxTiles) {
    zooms.pop()
  }
  return zooms
}
