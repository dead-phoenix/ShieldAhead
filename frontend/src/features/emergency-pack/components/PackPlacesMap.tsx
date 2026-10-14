import { useId, useMemo } from 'react'
import { STREET_MAP_UNAVAILABLE_NOTE, streetMapCaption, type CrisisPackPlacesMap } from '../buildCrisisPack'
import { crisisPackMapKinds, crisisPackMapPointKey, type CrisisPackMapKind, type CrisisPackMapPoint } from '../crisisPackMapPoints'
import {
  CRISIS_PACK_MAP_SIZE,
  projectToFrame,
  scaleBarFor,
  spreadMarkers,
  type MapProjection,
} from '../crisisPackMapProjection'
import type { CrisisPackStreetMap } from '../useCrisisPackMap'

const INK = '#1b2438'
const ACCENT = '#3f6b63'
const MARKER_SIZE = 36
const MARKER_GAP = 4
const FRAME_PADDING = 56
const SCALE_BAR_MAX_PX = 180
/** Lightens and greys the street picture so navy markers stand out in colour and black-and-white prints. */
const STREET_MAP_OPACITY = 0.55
const STREET_MAP_SATURATION = 0.35
/** 18 units is 9pt when the map is printed at full content width. */
const ATTRIBUTION_FONT_SIZE = 18
/** Average Inter glyph width in em; textLength pins the text to this estimate so the box always fits it. */
const ATTRIBUTION_EM_PER_CHAR = 0.55
const ATTRIBUTION_PAD_X = 8
const ATTRIBUTION_PAD_Y = 5
/** Room the scale bar keeps on the left of the bottom edge. */
const SCALE_BAR_AREA = 24 + SCALE_BAR_MAX_PX + 24

function MarkerShape({ kind, label, x, y, size }: { kind: CrisisPackMapKind; label: string; x: number; y: number; size: number }) {
  const half = size / 2
  const isFilled = crisisPackMapKinds[kind].shape === 'square'
  const strokeWidth = size * 0.07
  return (
    <g className={`pack-map-marker pack-map-marker--${kind}`}>
      {crisisPackMapKinds[kind].shape === 'circle' ? (
        <circle cx={x} cy={y} r={half - strokeWidth / 2} fill="#fff" stroke={INK} strokeWidth={strokeWidth} />
      ) : (
        <rect
          x={x - half + strokeWidth / 2}
          y={y - half + strokeWidth / 2}
          width={size - strokeWidth}
          height={size - strokeWidth}
          fill={INK}
          stroke={INK}
          strokeWidth={strokeWidth}
        />
      )}
      <text
        x={x}
        y={y}
        fill={isFilled ? '#fff' : INK}
        fontFamily="Inter, sans-serif"
        fontSize={size * 0.42}
        fontWeight={700}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {label}
      </text>
    </g>
  )
}

/** A marker on its own, for list rows and the legend, so they match the map. */
export function PackMarkerGlyph({ kind, label, className }: { kind: CrisisPackMapKind; label: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" role="img" aria-label={label}>
      <MarkerShape kind={kind} label={label} x={20} y={20} size={38} />
    </svg>
  )
}

function NorthArrow({ x, y }: { x: number; y: number }) {
  return (
    <g className="pack-map-north" aria-hidden="true">
      <path d={`M ${x} ${y - 22} L ${x + 11} ${y + 12} L ${x} ${y + 5} L ${x - 11} ${y + 12} Z`} fill={INK} />
      <text x={x} y={y + 34} fill={INK} fontFamily="Inter, sans-serif" fontSize={18} fontWeight={700} textAnchor="middle">N</text>
    </g>
  )
}

function ScaleBar({ x, y, pixels, label }: { x: number; y: number; pixels: number; label: string }) {
  return (
    <g className="pack-map-scale" aria-hidden="true">
      <rect x={x - 6} y={y - 30} width={pixels + 12} height={40} fill="#fff" opacity={0.85} />
      <path d={`M ${x} ${y - 8} V ${y} H ${x + pixels} V ${y - 8}`} fill="none" stroke={INK} strokeWidth={3} />
      <text x={x} y={y - 14} fill={INK} fontFamily="Inter, sans-serif" fontSize={16}>{label}</text>
    </g>
  )
}

function Attribution({ text, width, height }: { text: string; width: number; height: number }) {
  const fontSize = Math.min(ATTRIBUTION_FONT_SIZE, (width - SCALE_BAR_AREA) / (text.length * ATTRIBUTION_EM_PER_CHAR))
  const textWidth = text.length * fontSize * ATTRIBUTION_EM_PER_CHAR
  const boxWidth = textWidth + 2 * ATTRIBUTION_PAD_X
  const boxHeight = fontSize + 2 * ATTRIBUTION_PAD_Y
  const x = width - 2 - boxWidth
  const y = height - 2 - boxHeight
  return (
    <g className="pack-map-attribution">
      <rect x={x} y={y} width={boxWidth} height={boxHeight} fill="#fff" opacity={0.85} />
      <text
        x={x + ATTRIBUTION_PAD_X}
        y={y + boxHeight / 2}
        fill={INK}
        fontFamily="Inter, sans-serif"
        fontSize={fontSize}
        dominantBaseline="central"
        textLength={textWidth}
        lengthAdjust="spacingAndGlyphs"
      >
        {text}
      </text>
    </g>
  )
}

/** Marker positions from the street map, or null when it does not cover every point or has another size. */
function streetMapProjection(points: CrisisPackMapPoint[], streetMap: CrisisPackStreetMap | undefined): MapProjection | null {
  if (!streetMap) return null
  if (streetMap.width !== CRISIS_PACK_MAP_SIZE.width || streetMap.height !== CRISIS_PACK_MAP_SIZE.height) return null
  const positions = new Map(streetMap.positions.map((position) => [position.key, position]))
  const projected = points.flatMap((point) => {
    const position = positions.get(crisisPackMapPointKey(point))
    return position ? [{ id: position.key, x: position.x, y: position.y }] : []
  })
  return projected.length === points.length ? { points: projected, metersPerPixel: streetMap.metersPerPixel } : null
}

export function PackPlacesMap({
  map,
  streetMap,
  streetMapFailed = false,
}: {
  map: CrisisPackPlacesMap
  /** Street picture made for exactly these places; the simplified map is drawn without it. */
  streetMap?: CrisisPackStreetMap
  streetMapFailed?: boolean
}) {
  const { width, height } = CRISIS_PACK_MAP_SIZE
  const filterId = `pack-map-print-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const visiblePoints = useMemo(
    () => map.points.filter((point) => map.visibleKinds.includes(point.kind)),
    [map.points, map.visibleKinds],
  )
  const layout = useMemo(() => {
    const frame = { width, height, padding: FRAME_PADDING }
    const street = streetMapProjection(map.points, streetMap)
    const projection = street ?? projectToFrame(
      map.points.map((point) => ({ id: crisisPackMapPointKey(point), latitude: point.latitude, longitude: point.longitude })),
      frame,
    )
    if (!projection) return null
    const visibleKeys = new Set(visiblePoints.map(crisisPackMapPointKey))
    const spread = spreadMarkers(
      projection.points.filter((point) => visibleKeys.has(point.id)),
      MARKER_SIZE + MARKER_GAP,
      frame,
    )
    return {
      spread: new Map(spread.map((point) => [point.id, point])),
      scaleBar: scaleBarFor(projection.metersPerPixel, SCALE_BAR_MAX_PX),
      street: street && streetMap ? streetMap : null,
    }
  }, [height, map.points, streetMap, visiblePoints, width])

  if (visiblePoints.length === 0 || !layout) {
    return <p className="pack-places-map__note">{map.noPointsNote}</p>
  }

  const legendKinds = map.visibleKinds.filter((kind) => visiblePoints.some((point) => point.kind === kind))
  const positioned = visiblePoints.flatMap((point) => {
    const position = layout.spread.get(crisisPackMapPointKey(point))
    return position ? [{ point, position }] : []
  })

  return (
    <div className="pack-places-map-slot">
      <figure className="pack-places-map">
        <svg
          className="pack-places-map__svg"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`Map of saved places: ${visiblePoints.map((point) => point.label).join(', ')}`}
        >
          {layout.street ? (
            <>
              <defs>
                <filter id={filterId} colorInterpolationFilters="sRGB">
                  <feColorMatrix type="saturate" values={String(STREET_MAP_SATURATION)} />
                </filter>
              </defs>
              <rect x={0} y={0} width={width} height={height} fill="#fff" />
              <image
                className="pack-places-map__street"
                href={layout.street.url}
                x={0}
                y={0}
                width={width}
                height={height}
                preserveAspectRatio="none"
                opacity={STREET_MAP_OPACITY}
                filter={`url(#${filterId})`}
              />
              <rect x={1} y={1} width={width - 2} height={height - 2} fill="none" stroke={ACCENT} strokeWidth={2} />
              <Attribution text={layout.street.attribution} width={width} height={height} />
            </>
          ) : (
            <rect x={1} y={1} width={width - 2} height={height - 2} fill="#fff" stroke={ACCENT} strokeWidth={2} />
          )}
          {positioned.filter(({ position }) => position.hasLeader).map(({ point, position }) => (
            <g key={`leader-${crisisPackMapPointKey(point)}`} aria-hidden="true">
              <line x1={position.anchorX} y1={position.anchorY} x2={position.x} y2={position.y} stroke={INK} strokeWidth={1.5} />
              <circle cx={position.anchorX} cy={position.anchorY} r={3} fill={INK} />
            </g>
          ))}
          {positioned.map(({ point, position }) => (
            <MarkerShape
              key={crisisPackMapPointKey(point)}
              kind={point.kind}
              label={point.label}
              x={position.x}
              y={position.y}
              size={MARKER_SIZE}
            />
          ))}
          <ScaleBar x={24} y={height - 22} pixels={layout.scaleBar.pixels} label={layout.scaleBar.label} />
          <NorthArrow x={width - 36} y={40} />
        </svg>
        <figcaption className="pack-places-map__caption">
          {legendKinds.map((kind) => (
            <span className="pack-places-map__legend-item" key={kind}>
              <PackMarkerGlyph className="pack-places-map__legend-glyph" kind={kind} label={crisisPackMapKinds[kind].prefix} />
              <span>{crisisPackMapKinds[kind].legendLabel}</span>
            </span>
          ))}
          <span>{layout.street ? streetMapCaption(layout.street.createdAt) : map.caption}</span>
          {!layout.street && streetMapFailed ? <span className="pack-places-map__status">{STREET_MAP_UNAVAILABLE_NOTE}</span> : null}
        </figcaption>
      </figure>
      <p className="pack-places-map__no-room">{map.noRoomNote}</p>
    </div>
  )
}
