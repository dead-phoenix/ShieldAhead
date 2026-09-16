import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  readCrisisChecklist,
  saveCrisisChecklist,
} from './crisisChecklistStorage'


describe('Iteration 2 local checklist storage', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })


  it('returns an empty state when no checklist progress exists', () => {
    const result = readCrisisChecklist('bushfire')

    expect(result).toEqual({})
  })


  it('saves and restores checklist progress', () => {
    const state = {
      'household-plan.local-information': true,
      'household-plan.contact-plan': true,
    }

    saveCrisisChecklist('flood', state)

    expect(readCrisisChecklist('flood')).toEqual(state)
  })


  it('keeps checklist data separate for each hazard', () => {
    saveCrisisChecklist('bushfire', {
      'household-plan.plan-reviewed': true,
    })

    saveCrisisChecklist('flood', {
      'household-plan.local-information': true,
    })

    expect(readCrisisChecklist('bushfire')).toEqual({
      'household-plan.plan-reviewed': true,
    })

    expect(readCrisisChecklist('flood')).toEqual({
      'household-plan.local-information': true,
    })
  })


  it('allows checklist progress to be updated', () => {
    saveCrisisChecklist('power-outage', {
      'household-plan.outage-plan': true,
    })

    saveCrisisChecklist('power-outage', {
      'household-plan.outage-plan': false,
      'household-plan.lighting-plan': true,
    })

    expect(readCrisisChecklist('power-outage')).toEqual({
      'household-plan.outage-plan': false,
      'household-plan.lighting-plan': true,
    })
  })


  it('handles corrupted local storage without crashing', () => {
    vi.spyOn(Storage.prototype, 'getItem')
      .mockReturnValue('{invalid-json')

    expect(() => readCrisisChecklist('flood')).not.toThrow()

    expect(readCrisisChecklist('flood')).toEqual({})
  })
})