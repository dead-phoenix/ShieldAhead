import {
  ArrowBendUpLeft,
  ArrowBendUpRight,
  ArrowElbowLeft,
  ArrowElbowRight,
  ArrowsClockwise,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  ArrowUUpLeft,
  FlagCheckered,
  SpeakerHigh,
  SpeakerSlash,
} from '@phosphor-icons/react'
import type { NavigationStep } from '../../data/api/directionsApi'
import type { NavigationProgress } from '../navigation/liveNavigationMath'
import { announcementText } from '../navigation/maneuverPresentation'

function ManeuverIcon({ type }: { type: number }) {
  if (type === 0) return <ArrowElbowLeft aria-hidden="true" size={28} weight="bold" />
  if (type === 1) return <ArrowElbowRight aria-hidden="true" size={28} weight="bold" />
  if (type === 2) return <ArrowBendUpLeft aria-hidden="true" size={28} weight="bold" />
  if (type === 3) return <ArrowBendUpRight aria-hidden="true" size={28} weight="bold" />
  if (type === 4 || type === 12) return <ArrowUpLeft aria-hidden="true" size={28} weight="bold" />
  if (type === 5 || type === 13) return <ArrowUpRight aria-hidden="true" size={28} weight="bold" />
  if (type === 7 || type === 8) return <ArrowsClockwise aria-hidden="true" size={28} weight="bold" />
  if (type === 9) return <ArrowUUpLeft aria-hidden="true" size={28} weight="bold" />
  if (type === 10) return <FlagCheckered aria-hidden="true" size={28} weight="fill" />
  return <ArrowUp aria-hidden="true" size={28} weight="bold" />
}

function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`
}

function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60))
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} hr ${minutes % 60} min`
}

interface LiveNavigationOverlayProps {
  destinationName: string
  steps: NavigationStep[]
  progress?: NavigationProgress
  remainingDurationSeconds?: number
  error: string
  isRerouting: boolean
  voiceEnabled: boolean
  onToggleVoice: () => void
  onEnd: () => void
}

export function LiveNavigationOverlay({
  destinationName,
  steps,
  progress,
  remainingDurationSeconds,
  error,
  isRerouting,
  voiceEnabled,
  onToggleVoice,
  onEnd,
}: LiveNavigationOverlayProps) {
  const currentStep = progress ? steps[progress.currentStepIndex] : undefined
  const nextStep = progress ? steps[progress.currentStepIndex + 1] : undefined

  return (
    <section className="live-navigation" aria-label="Live navigation" aria-live="polite">
      <div className="live-navigation__header">
        <h2>Navigating to {destinationName}</h2>
        <button className="live-navigation__icon-button" type="button" onClick={onToggleVoice} aria-pressed={voiceEnabled} aria-label={voiceEnabled ? 'Mute voice directions' : 'Unmute voice directions'}>
          {voiceEnabled ? <SpeakerHigh aria-hidden="true" size={20} /> : <SpeakerSlash aria-hidden="true" size={20} />}
        </button>
      </div>

      {error ? <p className="directions-error" role="alert">{error}</p> : null}
      {isRerouting ? <p className="live-navigation__status" role="status">Recalculating your route…</p> : null}

      {!progress && !error ? (
        <p className="live-navigation__status" role="status">Finding your location…</p>
      ) : null}

      {progress?.hasArrived ? (
        <div className="live-navigation__arrived" role="status">
          <FlagCheckered aria-hidden="true" size={32} weight="fill" />
          <strong>You have arrived at {destinationName}</strong>
        </div>
      ) : progress && currentStep ? (
        <>
          <div className="live-navigation__instruction">
            <span className="live-navigation__maneuver-icon"><ManeuverIcon type={(nextStep ?? currentStep).maneuverType} /></span>
            <div>
              <strong>{announcementText(nextStep ?? currentStep)}</strong>
              <span>{formatDistance(progress.distanceToNextManeuverMeters)}</span>
            </div>
          </div>
          {progress.isOffRoute ? (
            <p className="live-navigation__status" role="status">You appear to be off the planned route.</p>
          ) : null}
          {steps[progress.currentStepIndex + 2] ? (
            <p className="live-navigation__then">Then {announcementText(steps[progress.currentStepIndex + 2]).toLowerCase()}</p>
          ) : null}
        </>
      ) : null}

      {progress && !progress.hasArrived ? (
        <div className="live-navigation__footer">
          <span><strong>{formatDistance(progress.distanceRemainingMeters)}</strong> remaining</span>
          {remainingDurationSeconds !== undefined ? <span>{formatDuration(remainingDurationSeconds)}</span> : null}
        </div>
      ) : null}

      <button className="button button--quiet" type="button" onClick={onEnd}>
        End navigation
      </button>
    </section>
  )
}

export { ManeuverIcon }
