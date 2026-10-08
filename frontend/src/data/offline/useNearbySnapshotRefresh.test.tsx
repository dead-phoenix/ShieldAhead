import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { storageKeys } from '../../app/config/product'
import { refreshNearbySnapshot } from './nearbySnapshot'
import { useNearbySnapshotRefresh } from './useNearbySnapshotRefresh'

vi.mock('./nearbySnapshot', () => ({ refreshNearbySnapshot: vi.fn() }))

function Harness() {
  useNearbySnapshotRefresh()
  return null
}

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value })
}

describe('useNearbySnapshotRefresh', () => {
  beforeEach(() => {
    vi.mocked(refreshNearbySnapshot).mockReset().mockResolvedValue('saved')
    window.sessionStorage.removeItem(storageKeys.nearbyRefreshTried)
    window.localStorage.setItem(storageKeys.myArea, JSON.stringify({ postcode: '3453', label: '3453', savedAt: '' }))
    setOnline(true)
  })

  afterEach(() => setOnline(true))

  it('refreshes at most once per session when online with My area set', () => {
    const { unmount } = render(<Harness />)
    unmount()
    render(<Harness />)

    expect(refreshNearbySnapshot).toHaveBeenCalledTimes(1)
    expect(window.sessionStorage.getItem(storageKeys.nearbyRefreshTried)).not.toBeNull()
  })

  it('does nothing without My area, or when the session was already refreshed (as in other app tests)', () => {
    window.localStorage.removeItem(storageKeys.myArea)
    render(<Harness />)
    expect(refreshNearbySnapshot).not.toHaveBeenCalled()

    window.localStorage.setItem(storageKeys.myArea, JSON.stringify({ postcode: '3453', label: '3453', savedAt: '' }))
    window.sessionStorage.setItem(storageKeys.nearbyRefreshTried, 'test')
    render(<Harness />)
    expect(refreshNearbySnapshot).not.toHaveBeenCalled()
  })

  it('waits until the device is online', () => {
    setOnline(false)
    render(<Harness />)
    expect(refreshNearbySnapshot).not.toHaveBeenCalled()

    setOnline(true)
    window.dispatchEvent(new Event('online'))
    expect(refreshNearbySnapshot).toHaveBeenCalledTimes(1)
  })

  // Vitest fails the run on an unhandled rejection, so reaching the end proves the failure was swallowed.
  it('stays silent when the refresh fails', async () => {
    vi.mocked(refreshNearbySnapshot).mockRejectedValue(new Error('offline'))
    const { container } = render(<Harness />)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(refreshNearbySnapshot).toHaveBeenCalledTimes(1)
    expect(container).toBeEmptyDOMElement()
  })
})
