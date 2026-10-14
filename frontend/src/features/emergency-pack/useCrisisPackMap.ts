import { useEffect, useRef, useState } from 'react'
import { resolveMapStyleUrl } from '../../shared/map/mapStyleUrl'
import { crisisPackPlacesKey, type CrisisPackMapPoint } from './crisisPackMapPoints'
import { readCrisisPackMapSnapshot, saveCrisisPackMapSnapshot, type CrisisPackMapSnapshot } from './crisisPackMapStorage'
import { renderCrisisPackMap, type CrisisPackMapPosition } from './renderCrisisPackMap'

const PRINT_DECODE_TIMEOUT_MS = 2000

/** A stored street map ready to draw, with an object URL for its picture. */
export interface CrisisPackStreetMap {
  placesKey: string
  url: string
  createdAt: string
  attribution: string
  width: number
  height: number
  positions: CrisisPackMapPosition[]
  metersPerPixel: number
}

export type CrisisPackStreetMapStatus = 'none' | 'rendering' | 'ready' | 'failed'

export interface CrisisPackStreetMapState {
  /** Only ever set when it was made for exactly the current places and map style. */
  streetMap?: CrisisPackStreetMap
  status: CrisisPackStreetMapStatus
}

interface HookState {
  shown?: CrisisPackStreetMap
  renderingKey?: string
  failedKey?: string
}

let renderQueue: Promise<unknown> = Promise.resolve()

/** Runs renders one after another, so only one throwaway MapLibre map exists at a time. */
function queueRender<T>(task: () => Promise<T>): Promise<T> {
  const run = renderQueue.then(task, task)
  renderQueue = run.catch(() => undefined)
  return run
}

function toStreetMap(snapshot: CrisisPackMapSnapshot, url: string): CrisisPackStreetMap {
  return {
    placesKey: snapshot.placesKey,
    url,
    createdAt: snapshot.createdAt,
    attribution: snapshot.attribution,
    width: snapshot.width,
    height: snapshot.height,
    positions: snapshot.positions,
    metersPerPixel: snapshot.metersPerPixel,
  }
}

/**
 * Shows the stored street map when it matches the current places and style,
 * otherwise makes a new one while online and canRender is true. Any failure
 * leaves the simplified map in place.
 */
export function useCrisisPackMap(
  points: CrisisPackMapPoint[],
  { isOnline, canRender }: { isOnline: boolean; canRender: boolean },
): CrisisPackStreetMapState {
  const styleUrl = resolveMapStyleUrl()
  const placesKey = points.length > 0 ? crisisPackPlacesKey(points, styleUrl) : ''
  const [state, setState] = useState<HookState>({})
  const shownKeyRef = useRef('')

  useEffect(() => {
    if (!placesKey || shownKeyRef.current === placesKey) return
    const controller = new AbortController()
    const { signal } = controller

    const show = (snapshot: CrisisPackMapSnapshot) => {
      shownKeyRef.current = snapshot.placesKey
      const url = URL.createObjectURL(new Blob([snapshot.imageBytes], { type: snapshot.imageType }))
      setState({ shown: toStreetMap(snapshot, url) })
    }

    void (async () => {
      const stored = await readCrisisPackMapSnapshot()
      if (signal.aborted) return
      if (stored?.placesKey === placesKey) {
        show(stored)
        return
      }
      if (!isOnline || !canRender) return

      setState((current) => ({ shown: current.shown, renderingKey: placesKey }))
      try {
        const rendered = await queueRender(() => renderCrisisPackMap(points, { styleUrl, signal }))
        const snapshot: CrisisPackMapSnapshot = {
          placesKey,
          styleUrl,
          createdAt: new Date().toISOString(),
          attribution: rendered.attribution,
          width: rendered.width,
          height: rendered.height,
          pixelRatio: rendered.pixelRatio,
          imageType: rendered.image.type || 'image/png',
          imageBytes: await rendered.image.arrayBuffer(),
          positions: rendered.positions,
          metersPerPixel: rendered.metersPerPixel,
          zoom: rendered.zoom,
          centerLatitude: rendered.centerLatitude,
        }
        if (signal.aborted) return
        show(snapshot)
        await saveCrisisPackMapSnapshot(snapshot).catch(() => undefined)
      } catch {
        if (!signal.aborted) setState((current) => ({ shown: current.shown, failedKey: placesKey }))
      }
    })()

    return () => controller.abort()
    // placesKey already changes with every point and with the style URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placesKey, isOnline, canRender])

  const shownUrl = state.shown?.url
  useEffect(() => () => {
    if (shownUrl) URL.revokeObjectURL(shownUrl)
  }, [shownUrl])

  if (!placesKey) return { status: 'none' }
  if (state.shown?.placesKey === placesKey) return { streetMap: state.shown, status: 'ready' }
  if (state.failedKey === placesKey) return { status: 'failed' }
  if (state.renderingKey === placesKey) return { status: 'rendering' }
  return { status: 'none' }
}

/** Resolves once the street map picture is decoded, or after 2 seconds, whichever is first. */
export function waitForStreetMapDecode(url: string, timeoutMs = PRINT_DECODE_TIMEOUT_MS): Promise<void> {
  const image = new Image()
  image.src = url
  let timer = 0
  const timeout = new Promise<void>((resolve) => {
    timer = window.setTimeout(resolve, timeoutMs)
  })
  const decoded = image.decode().catch(() => undefined)
  return Promise.race([decoded, timeout]).finally(() => window.clearTimeout(timer))
}
