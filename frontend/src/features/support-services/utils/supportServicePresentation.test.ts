import { describe, expect, it } from 'vitest'
import type { SupportService } from '../../../data/contracts'
import {
  getAvailabilityPresentation,
  sortSupportServices,
} from './supportServicePresentation'

const baseService: SupportService = {
  id: 'base',
  name: 'Example service',
  serviceTypes: ['Emergency relief'],
  suburb: 'Harcourt',
  postcode: '3453',
  availabilityStatus: 'not-confirmed',
  dataUpdatedAt: '2026-08-27T09:42:00.000Z',
}

describe('support service presentation', () => {
  it('sorts known distances first and leaves unknown distances last', () => {
    const result = sortSupportServices([
      { ...baseService, id: 'unknown' },
      { ...baseService, id: 'far', distanceKm: 8 },
      { ...baseService, id: 'near', distanceKm: 1.2 },
    ])

    expect(result.map(({ id }) => id)).toEqual(['near', 'far', 'unknown'])
  })

  it.each([
    ['normal', 'Normal availability — example partner update', 'normal'],
    ['low', 'Low availability — example partner update', 'low'],
    ['closed', 'Closed — example partner update', 'closed'],
    ['not-confirmed', 'Availability not confirmed', 'not-confirmed'],
  ] as const)('maps %s availability to clear copy and tone', (status, title, tone) => {
    const result = getAvailabilityPresentation({
      ...baseService,
      availabilityStatus: status,
      availabilityUpdatedAt: '2026-08-28T08:15:00.000Z',
    })

    expect(result.title).toBe(title)
    expect(result.tone).toBe(tone)
  })

  it('marks an old partner update as stale without hiding its last status', () => {
    const result = getAvailabilityPresentation({
      ...baseService,
      availabilityStatus: 'normal',
      availabilityFreshness: 'stale',
      availabilityUpdatedAt: '2026-05-01T09:20:00.000Z',
    })

    expect(result.title).toBe('Normal availability — old example update')
    expect(result.tone).toBe('stale')
  })
})
