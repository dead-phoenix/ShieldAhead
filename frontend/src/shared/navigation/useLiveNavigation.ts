import { useEffect, useRef, useState } from 'react'
import type { NavigationStep } from '../../data/api/directionsApi'
import { useLivePosition, type LivePosition } from '../hooks/useLivePosition'
import { announcementText } from './maneuverPresentation'
import { computeNavigationProgress, type NavigationProgress } from './liveNavigationMath'

// Consecutive off-route GPS fixes required before triggering a reroute —
// rides out a single noisy reading (phones commonly jump 20-40m near tall
// buildings) rather than rerouting on every blip.
const OFF_ROUTE_CONFIRM_COUNT = 3
// Minimum time between automatic reroutes, so a genuinely poor GPS signal
// can't fire off repeated route requests in a tight loop.
const REROUTE_COOLDOWN_MS = 15_000
// How far out (metres) to speak the upcoming maneuver, and again right at it.
const ANNOUNCE_NEAR_METERS = 150
const ANNOUNCE_NOW_METERS = 25

export interface LiveRoute {
  coordinates: [number, number][]
  steps: NavigationStep[]
}

export interface UseLiveNavigationOptions {
  route?: LiveRoute
  onOffRoute?: (position: LivePosition) => void
  voiceEnabled?: boolean
}

export interface UseLiveNavigationResult {
  isActive: boolean
  position?: LivePosition
  progress?: NavigationProgress
  error: string
  start: () => void
  stop: () => void
}

function speak(text: string) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  window.speechSynthesis.speak(utterance)
}

export function useLiveNavigation({ route, onOffRoute, voiceEnabled = true }: UseLiveNavigationOptions): UseLiveNavigationResult {
  const livePosition = useLivePosition()
  const [progress, setProgress] = useState<NavigationProgress>()
  const offRouteStreakRef = useRef(0)
  const lastRerouteAtRef = useRef(0)
  const announcedRef = useRef({ stepIndex: -1, announcedNear: false, announcedNow: false })
  const hasAnnouncedArrivalRef = useRef(false)
  const onOffRouteRef = useRef(onOffRoute)
  onOffRouteRef.current = onOffRoute

  useEffect(() => {
    if (!livePosition.position || !route || route.coordinates.length < 2) return
    const next = computeNavigationProgress(
      { latitude: livePosition.position.latitude, longitude: livePosition.position.longitude },
      route.coordinates,
      route.steps,
    )
    setProgress(next)
    if (!next) return

    if (next.isOffRoute) {
      offRouteStreakRef.current += 1
    } else {
      offRouteStreakRef.current = 0
    }
    const now = Date.now()
    if (offRouteStreakRef.current >= OFF_ROUTE_CONFIRM_COUNT && now - lastRerouteAtRef.current > REROUTE_COOLDOWN_MS) {
      lastRerouteAtRef.current = now
      offRouteStreakRef.current = 0
      onOffRouteRef.current?.(livePosition.position)
    }

    if (announcedRef.current.stepIndex !== next.currentStepIndex) {
      announcedRef.current = { stepIndex: next.currentStepIndex, announcedNear: false, announcedNow: false }
    }
    const nextStep = route.steps[next.currentStepIndex + 1]
    if (voiceEnabled && nextStep) {
      if (!announcedRef.current.announcedNear && next.distanceToNextManeuverMeters <= ANNOUNCE_NEAR_METERS) {
        announcedRef.current.announcedNear = true
        speak(announcementText(nextStep, Math.round(next.distanceToNextManeuverMeters)))
      }
      if (!announcedRef.current.announcedNow && next.distanceToNextManeuverMeters <= ANNOUNCE_NOW_METERS) {
        announcedRef.current.announcedNow = true
        speak(announcementText(nextStep))
      }
    }

    if (next.hasArrived && !hasAnnouncedArrivalRef.current) {
      hasAnnouncedArrivalRef.current = true
      if (voiceEnabled) speak('You have arrived at your destination.')
    }
    // route/voiceEnabled are read fresh each call; only a new position fix
    // should re-run this derivation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePosition.position])

  function start() {
    hasAnnouncedArrivalRef.current = false
    announcedRef.current = { stepIndex: -1, announcedNear: false, announcedNow: false }
    offRouteStreakRef.current = 0
    setProgress(undefined)
    livePosition.start()
  }

  function stop() {
    livePosition.stop()
    setProgress(undefined)
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel()
  }

  return {
    isActive: livePosition.isWatching,
    position: livePosition.position,
    progress,
    error: livePosition.error,
    start,
    stop,
  }
}
