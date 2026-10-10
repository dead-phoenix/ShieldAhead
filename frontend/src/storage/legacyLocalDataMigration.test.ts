import { beforeEach, describe, expect, it, vi } from 'vitest'
import { storageKeys } from '../app/config/product'
import { preloadNearbyData } from '../data/preloadNearbyData'
import { migrateLegacyLocalData } from './legacyLocalDataMigration'
import { getMyArea, saveMyArea } from './myAreaStorage'
import { getHouseholdProfile } from './onboardingDraftStorage'

vi.mock('../data/preloadNearbyData', () => ({
  preloadNearbyData: vi.fn(),
}))

function stored(key: string) {
  const raw = window.localStorage.getItem(key)
  return raw ? JSON.parse(raw) as Record<string, unknown> : null
}

const oldProfile = {
  name: 'Mel',
  age: 42,
  householdSize: 4,
  childrenUnder15: 2,
  hasPets: true,
  accessibilityNeeds: ['Wheelchair'],
  healthNeeds: ['Insulin'],
  postcode: '3453',
}

describe('legacy local data migration', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.mocked(preloadNearbyData).mockClear()
  })

  it('moves the old profile postcode into My area and rewrites the profile without removed fields', () => {
    window.localStorage.setItem(storageKeys.householdProfile, JSON.stringify(oldProfile))

    migrateLegacyLocalData()

    expect(stored(storageKeys.householdProfile)).toEqual({
      childrenUnder15: 2,
      hasPets: true,
      accessibilityNeeds: ['Wheelchair'],
      healthNeeds: ['Insulin'],
    })
    expect(getMyArea()).toMatchObject({ postcode: '3453', label: '3453' })
    expect(getMyArea()?.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('migrates only once, so a later My area change is not overwritten', () => {
    window.localStorage.setItem(storageKeys.householdProfile, JSON.stringify(oldProfile))
    migrateLegacyLocalData()
    saveMyArea({ postcode: '3550' })

    migrateLegacyLocalData()
    getHouseholdProfile()

    expect(getMyArea()?.postcode).toBe('3550')
  })

  it('does not replace an existing My area with the old profile postcode', () => {
    saveMyArea({ postcode: '3000' })
    window.localStorage.setItem(storageKeys.householdProfile, JSON.stringify(oldProfile))

    expect(getHouseholdProfile()).not.toHaveProperty('postcode')
    expect(getMyArea()?.postcode).toBe('3000')
  })

  it('drops an invalid old postcode without creating My area', () => {
    window.localStorage.setItem(storageKeys.householdProfile, JSON.stringify({ name: 'Mel', postcode: 'abc' }))

    expect(getHouseholdProfile()).toEqual({})
    expect(window.localStorage.getItem(storageKeys.myArea)).toBeNull()
  })

  it('removes the old basics consent category', () => {
    window.localStorage.setItem(storageKeys.consent, JSON.stringify({
      profileStorageAccepted: true,
      optionalCategories: { basics: true, dependants: true, needs: false },
      updatedAt: '2026-09-01T00:00:00.000Z',
    }))

    migrateLegacyLocalData()

    expect(stored(storageKeys.consent)?.optionalCategories).toEqual({ dependants: true, needs: false })
  })

  it('survives broken JSON without throwing or rewriting it', () => {
    window.localStorage.setItem(storageKeys.householdProfile, '{not json')
    window.localStorage.setItem(storageKeys.consent, '[]')

    expect(() => migrateLegacyLocalData()).not.toThrow()
    expect(getHouseholdProfile()).toBeNull()
    expect(window.localStorage.getItem(storageKeys.householdProfile)).toBe('{not json')
  })

  it('leaves an already-migrated profile untouched', () => {
    const current = JSON.stringify({ hasPets: false })
    window.localStorage.setItem(storageKeys.householdProfile, current)
    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    migrateLegacyLocalData()

    expect(setItem).not.toHaveBeenCalled()
    setItem.mockRestore()
  })

  it('preloads nearby data only when My area changes postcode', () => {
    saveMyArea({ postcode: '3453' })
    saveMyArea({ postcode: '3453' })
    saveMyArea({ postcode: '3550' })

    expect(vi.mocked(preloadNearbyData).mock.calls).toEqual([
      ['3453', { includeSupport: false }],
      ['3550', { includeSupport: false }],
    ])
  })

  it('rejects an invalid My area postcode', () => {
    expect(saveMyArea({ postcode: '34' })).toBeNull()
    expect(getMyArea()).toBeNull()
  })
})
