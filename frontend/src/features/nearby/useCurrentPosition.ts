import { useState } from 'react'
import type { LatLng } from '../../shared/utils/geo'

export type PositionErrorReason = 'denied' | 'timeout' | 'unavailable' | 'unsupported'

export type CurrentPositionState =
  | { status: 'idle' }
  | { status: 'locating' }
  | { status: 'found'; point: LatLng }
  | { status: 'error'; reason: PositionErrorReason }

const POSITION_TIMEOUT_MS = 15_000

/** One reading from the device's location, on request. The point stays in memory on this device. */
export function useCurrentPosition() {
  const [state, setState] = useState<CurrentPositionState>({ status: 'idle' })

  function request(onFound?: (point: LatLng) => void) {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setState({ status: 'error', reason: 'unsupported' })
      return
    }
    setState({ status: 'locating' })
    navigator.geolocation.getCurrentPosition(
      (result) => {
        const point = { lat: result.coords.latitude, lng: result.coords.longitude }
        setState({ status: 'found', point })
        onFound?.(point)
      },
      (error) => {
        const reason: PositionErrorReason = error.code === error.PERMISSION_DENIED
          ? 'denied'
          : error.code === error.TIMEOUT ? 'timeout' : 'unavailable'
        setState({ status: 'error', reason })
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: POSITION_TIMEOUT_MS },
    )
  }

  return { state, request }
}
