import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchChecklistItems, fetchHelplines } from '../../data/api/apiCrisisRepository'
import { bundledHelplinesFor, useCrisisChecklist, useHelplines } from './useCrisisApiContent'

vi.mock('../../data/api/apiCrisisRepository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/api/apiCrisisRepository')>()
  return { ...actual, fetchHelplines: vi.fn(), fetchChecklistItems: vi.fn() }
})

const fetchHelplinesMock = vi.mocked(fetchHelplines)
const fetchChecklistItemsMock = vi.mocked(fetchChecklistItems)

afterEach(() => {
  vi.clearAllMocks()
})

describe('bundledHelplinesFor', () => {
  it('includes Triple Zero for bushfire from the bundled file, with no network call', () => {
    const helplines = bundledHelplinesFor('bushfire')
    expect(helplines.some((h) => h.name === 'Triple Zero (000)')).toBe(true)
  })

  it('returns nothing for an unknown crisis type', () => {
    expect(bundledHelplinesFor('not-a-real-hazard')).toEqual([])
  })
})

describe('useHelplines', () => {
  it('shows the bundled helplines immediately, before the API resolves', () => {
    fetchHelplinesMock.mockReturnValue(new Promise(() => {})) // never resolves in this test
    const { result } = renderHook(() => useHelplines('bushfire'))
    expect(result.current.some((h) => h.name === 'Triple Zero (000)')).toBe(true)
  })

  it('replaces the bundled list once the API responds', async () => {
    const liveHelpline = { id: 'live-1', name: 'Live Helpline', serviceType: 'Emergency', phone: '111' }
    fetchHelplinesMock.mockResolvedValue([liveHelpline])
    const { result } = renderHook(() => useHelplines('bushfire'))

    await waitFor(() => expect(result.current).toEqual([liveHelpline]))
  })

  it('keeps the bundled helplines if the API call fails', async () => {
    fetchHelplinesMock.mockRejectedValue(new Error('network down'))
    const { result } = renderHook(() => useHelplines('bushfire'))

    await waitFor(() => expect(fetchHelplinesMock).toHaveBeenCalled())
    expect(result.current.some((h) => h.name === 'Triple Zero (000)')).toBe(true)
  })

  it('keeps the bundled helplines if the API returns an empty list', async () => {
    fetchHelplinesMock.mockResolvedValue([])
    const { result } = renderHook(() => useHelplines('bushfire'))

    await waitFor(() => expect(fetchHelplinesMock).toHaveBeenCalled())
    expect(result.current.some((h) => h.name === 'Triple Zero (000)')).toBe(true)
  })
})

describe('useCrisisChecklist', () => {
  it('shows the bundled checklist immediately, before the API resolves', () => {
    fetchChecklistItemsMock.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useCrisisChecklist('bushfire'))
    expect(result.current.length).toBeGreaterThan(0)
  })

  it('keeps the bundled checklist if the API call fails', async () => {
    fetchChecklistItemsMock.mockRejectedValue(new Error('network down'))
    const { result } = renderHook(() => useCrisisChecklist('bushfire'))

    await waitFor(() => expect(fetchChecklistItemsMock).toHaveBeenCalled())
    expect(result.current.length).toBeGreaterThan(0)
  })
})
