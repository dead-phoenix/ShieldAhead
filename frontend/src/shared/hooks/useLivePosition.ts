import { useEffect, useRef, useState } from 'react'

export interface LivePosition {
  latitude: number
  longitude: number
  /** Degrees clockwise from true north, when the device/browser can supply it. */
  heading?: number
  accuracyMeters: number
}

export interface UseLivePositionResult {
  position?: LivePosition
  error: string
  isSupported: boolean
  isWatching: boolean
  start: () => void
  stop: () => void
}

function messageForError(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) {
    return 'Location access is blocked. Allow location access for this site in your browser settings to navigate.'
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return 'Your location could not be determined. Move to an area with a clearer GPS signal and try again.'
  }
  return 'Your location signal was lost. Try again.'
}

/** Continuous GPS tracking for live navigation — unlike a one-off
 * getCurrentPosition() read, this keeps reporting new fixes until stop()
 * is called, so the map and turn-by-turn state can follow the traveller. */
export function useLivePosition(): UseLivePositionResult {
  const [position, setPosition] = useState<LivePosition>()
  const [error, setError] = useState('')
  const [isWatching, setIsWatching] = useState(false)
  const watchIdRef = useRef<number | undefined>(undefined)

  const isSupported = typeof navigator !== 'undefined' && 'geolocation' in navigator

  useEffect(() => () => {
    if (watchIdRef.current !== undefined) navigator.geolocation.clearWatch(watchIdRef.current)
  }, [])

  function start() {
    if (!isSupported) {
      setError('Live location is not supported on this device.')
      return
    }
    setError('')
    setIsWatching(true)
    watchIdRef.current = navigator.geolocation.watchPosition(
      (result) => {
        setPosition({
          latitude: result.coords.latitude,
          longitude: result.coords.longitude,
          heading: result.coords.heading ?? undefined,
          accuracyMeters: result.coords.accuracy,
        })
      },
      (geoError) => {
        setError(messageForError(geoError))
      },
      { enableHighAccuracy: true, maximumAge: 2_000, timeout: 15_000 },
    )
  }

  function stop() {
    if (watchIdRef.current !== undefined) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = undefined
    }
    setIsWatching(false)
  }

  return { position, error, isSupported, isWatching, start, stop }
}
