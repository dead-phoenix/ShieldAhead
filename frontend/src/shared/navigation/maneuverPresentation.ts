import type { NavigationStep } from '../../data/api/directionsApi'

// ORS Directions API maneuver type codes.
const MANEUVER_PHRASES: Record<number, string> = {
  0: 'Turn left',
  1: 'Turn right',
  2: 'Take a sharp left',
  3: 'Take a sharp right',
  4: 'Bear left',
  5: 'Bear right',
  6: 'Continue straight',
  7: 'Enter the roundabout',
  8: 'Exit the roundabout',
  9: 'Make a U-turn',
  10: 'Arrive at your destination',
  11: 'Head out',
  12: 'Keep left',
  13: 'Keep right',
}

export function maneuverPhrase(step: NavigationStep): string {
  const base = MANEUVER_PHRASES[step.maneuverType] ?? 'Continue'
  return step.streetName ? `${base} onto ${step.streetName}` : base
}

export function distancePhrase(meters: number): string {
  if (meters < 30) return 'now'
  if (meters < 1000) return `in ${Math.round(meters / 10) * 10} meters`
  return `in ${(meters / 1000).toFixed(1)} kilometers`
}

/** Spoken/displayed text for an upcoming step, e.g. "Turn right onto
 * Bourke Street Mall in 150 meters" or "...now" once imminent. */
export function announcementText(step: NavigationStep, distanceMeters?: number): string {
  if (distanceMeters === undefined) return maneuverPhrase(step)
  return `${maneuverPhrase(step)} ${distancePhrase(distanceMeters)}`
}
