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


  // Testing Plan 6.3
  // Normal local persistence

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


  it('keeps multiple completed items after reading storage again', () => {
    const state = {
      'household-plan.local-information': true,
      'household-plan.contact-plan': true,
      'children-pets.pet-plan': true,
      'health-access.medicine-plan': true,
    }

    saveCrisisChecklist('flood', state)

    const restored = readCrisisChecklist('flood')

    expect(restored).toEqual(state)
    expect(
      Object.values(restored).filter((value) => value === true),
    ).toHaveLength(4)
  })


  it('keeps checklist data separate for each hazard', () => {
    saveCrisisChecklist('bushfire', {
      'household-plan.plan-reviewed': true,
    })

    saveCrisisChecklist('flood', {
      'household-plan.local-information': true,
    })

    saveCrisisChecklist('power-outage', {
      'household-plan.outage-plan': true,
    })

    expect(readCrisisChecklist('bushfire')).toEqual({
      'household-plan.plan-reviewed': true,
    })

    expect(readCrisisChecklist('flood')).toEqual({
      'household-plan.local-information': true,
    })

    expect(readCrisisChecklist('power-outage')).toEqual({
      'household-plan.outage-plan': true,
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


  it('allows a completed checklist item to be deselected', () => {
    saveCrisisChecklist('bushfire', {
      'household-plan.plan-reviewed': true,
    })

    saveCrisisChecklist('bushfire', {
      'household-plan.plan-reviewed': false,
    })

    expect(readCrisisChecklist('bushfire')).toEqual({
      'household-plan.plan-reviewed': false,
    })
  })


  // Testing Plan 6.3
  // Missing and deleted local data

  it('returns a safe empty state when stored progress is deleted', () => {
    saveCrisisChecklist('flood', {
      'household-plan.local-information': true,
    })

    window.localStorage.clear()

    expect(() => readCrisisChecklist('flood')).not.toThrow()
    expect(readCrisisChecklist('flood')).toEqual({})
  })


  it('returns an empty state when the requested hazard has no stored record', () => {
    saveCrisisChecklist('bushfire', {
      'household-plan.plan-reviewed': true,
    })

    expect(readCrisisChecklist('flood')).toEqual({})
  })


  // Testing Plan 6.3
  // Damaged local data

  it('handles corrupted local storage without crashing', () => {
    vi.spyOn(Storage.prototype, 'getItem')
      .mockReturnValue('{invalid-json')

    expect(() => readCrisisChecklist('flood')).not.toThrow()

    expect(readCrisisChecklist('flood')).toEqual({})
  })


  it('handles an empty stored value without crashing', () => {
    vi.spyOn(Storage.prototype, 'getItem')
      .mockReturnValue('')

    expect(() => readCrisisChecklist('flood')).not.toThrow()
    expect(readCrisisChecklist('flood')).toEqual({})
  })


  
  // Testing Plan 6.3
  // Storage write failure

  it('does not change another hazard when one hazard is saved', () => {
    saveCrisisChecklist('bushfire', {
      'household-plan.plan-reviewed': true,
    })

    saveCrisisChecklist('flood', {
      'household-plan.local-information': true,
    })

    saveCrisisChecklist('flood', {
      'household-plan.local-information': false,
    })

    expect(readCrisisChecklist('bushfire')).toEqual({
      'household-plan.plan-reviewed': true,
    })

    expect(readCrisisChecklist('flood')).toEqual({
      'household-plan.local-information': false,
    })
  })
})