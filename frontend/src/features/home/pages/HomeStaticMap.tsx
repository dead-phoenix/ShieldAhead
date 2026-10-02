import { useEffect, useRef } from 'react'
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'

setWorkerUrl(workerUrl)

const defaultStyleUrl = 'https://tiles.openfreemap.org/styles/liberty'

/** A non-interactive map of central Melbourne for the home page preview. */
export function HomeStaticMap() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let map: MapLibreMap | undefined
    let styleReady = false
    try {
      map = new MapLibreMap({
        container,
        style: import.meta.env.VITE_MAP_STYLE_URL?.trim() || defaultStyleUrl,
        center: [144.9631, -37.8136],
        zoom: 11,
        interactive: false,
        attributionControl: {},
      })
    } catch {
      container.hidden = true
      return
    }

    const hideMap = () => {
      if (styleReady) return
      container.hidden = true
      map?.remove()
      map = undefined
    }

    map.once('styledata', () => {
      styleReady = true
      container.previousElementSibling?.setAttribute('aria-hidden', 'true')
    })
    map.on('error', hideMap)
    const timer = window.setTimeout(hideMap, 8000)

    return () => {
      window.clearTimeout(timer)
      map?.remove()
    }
  }, [])

  return (
    <div
      className="home-map__canvas"
      ref={containerRef}
      role="img"
      aria-label="Static map of central Melbourne"
    />
  )
}
