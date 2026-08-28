import type { SupportService } from '../../../data/contracts'
import { formatSavedDate } from '../../../shared/utils/formatDate'

export type AvailabilityTone =
  | 'closed'
  | 'low'
  | 'normal'
  | 'not-confirmed'
  | 'stale'

export interface AvailabilityPresentation {
  title: string
  detail: string
  tone: AvailabilityTone
}

function statusLabel(service: SupportService): string {
  if (service.availabilityStatus === 'normal') return 'Normal availability'
  if (service.availabilityStatus === 'low') return 'Low availability'
  if (service.availabilityStatus === 'closed') return 'Closed'
  return 'Availability not confirmed'
}

export function getAvailabilityPresentation(
  service: SupportService,
): AvailabilityPresentation {
  const updated = formatSavedDate(service.availabilityUpdatedAt)

  if (service.availabilityFreshness === 'stale') {
    return {
      title: `${statusLabel(service)} — old example update`,
      detail: `Last updated ${updated}. Reconnect or check directly before travelling.`,
      tone: 'stale',
    }
  }

  if (service.availabilityStatus === 'normal') {
    return {
      title: 'Normal availability — example partner update',
      detail: `Saved update: ${updated}. This status is not verified.`,
      tone: 'normal',
    }
  }

  if (service.availabilityStatus === 'low') {
    return {
      title: 'Low availability — example partner update',
      detail: service.phone
        ? `Saved update: ${updated}. Call ahead before travelling.`
        : `Saved update: ${updated}. Check directly before travelling.`,
      tone: 'low',
    }
  }

  if (service.availabilityStatus === 'closed') {
    return {
      title: 'Closed — example partner update',
      detail: `Saved update: ${updated}. Do not travel without checking for a newer update.`,
      tone: 'closed',
    }
  }

  return {
    title: 'Availability not confirmed',
    detail: service.phone
      ? 'Call ahead if you can before travelling.'
      : 'No published phone number is available. Check details before travelling.',
    tone: 'not-confirmed',
  }
}

export function formatServiceAddress(service: SupportService): string {
  if (service.address) {
    return `${service.address}, ${service.suburb} VIC ${service.postcode}`
  }
  return `Street address not confirmed. Listed for ${service.suburb} VIC ${service.postcode}.`
}

export function formatServiceDistance(service: SupportService, postcode: string): string {
  return service.distanceKm === undefined
    ? 'Distance from your postcode is not confirmed'
    : `${service.distanceKm} km from ${postcode}`
}

export function sortSupportServices(records: SupportService[]): SupportService[] {
  return [...records].sort(
    (left, right) =>
      (left.distanceKm ?? Number.POSITIVE_INFINITY) -
      (right.distanceKm ?? Number.POSITIVE_INFINITY),
  )
}
