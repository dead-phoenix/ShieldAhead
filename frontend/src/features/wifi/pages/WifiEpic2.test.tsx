import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMockWifiRepository } from '../../../data/mock/mockRepositories'
import { getSavedPlace, savePlace } from '../../../storage/savedPlacesStorage'
import { WifiDetailPage } from './WifiDetailPage'
import { WifiListPage } from './WifiListPage'

const repositoryMocks = vi.hoisted(() => ({
  getWifiRepository: vi.fn(),
}))

vi.mock('../../../data/wifiRepository', () => ({
  getWifiRepository: repositoryMocks.getWifiRepository,
}))

vi.mock('../../../shared/map/LazyMapView', () => ({
  LazyMapView: ({ ariaLabel, markers, onSelect }: { ariaLabel: string; markers: Array<{ id: string; name: string }>; onSelect: (ids: string[]) => void }) => (
    <div aria-label={ariaLabel} role="region">
      {markers.map((marker) => <button key={marker.id} type="button" onClick={() => onSelect([marker.id])}>{marker.name}</button>)}
    </div>
  ),
}))

function renderList(path: string, fixture: Parameters<typeof getMockWifiRepository>[0]) {
  repositoryMocks.getWifiRepository.mockReturnValue(getMockWifiRepository(fixture))
  return render(
    <MemoryRouter initialEntries={[path]}>
      <WifiListPage />
    </MemoryRouter>,
  )
}

function renderDetail(path: string, fixture: Parameters<typeof getMockWifiRepository>[0]) {
  repositoryMocks.getWifiRepository.mockReturnValue(getMockWifiRepository(fixture))
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/wifi/:id" element={<WifiDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Epic 2 Wi-Fi states', () => {
  it('lets the user choose between confirmed-first and nearest-first sorting', async () => {
    renderList('/wifi', 'default')

    const confirmedButton = await screen.findByRole('button', { name: 'Confirmed' })
    const nearestButton = screen.getByRole('button', { name: 'Nearest' })
    expect(confirmedButton).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(nearestButton)
    expect(nearestButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/showing 2 results, nearest first\./i)).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Map' }))
    expect(screen.queryByRole('group', { name: 'Sort results' })).not.toBeInTheDocument()
  })

  it('switches from a list row to the map when Show on map is pressed', async () => {
    renderList('/wifi', 'default')

    fireEvent.click((await screen.findAllByRole('button', { name: 'Show on map' }))[0])

    expect(await screen.findByRole('region', { name: /map of nearby free wi-fi/i })).toBeVisible()
  })

  it('switches to an embedded map and shows in-app marker details', async () => {
    renderList('/wifi', 'default')

    fireEvent.click(await screen.findByRole('button', { name: 'Map' }))

    expect(await screen.findByRole('region', { name: /map of nearby free wi-fi/i })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Example Harcourt Wi-Fi point' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Example Harcourt Wi-Fi point' }))
    expect(screen.getByRole('heading', { name: 'Example Harcourt Wi-Fi point' })).toBeVisible()
    expect(screen.getByText('Distance')).toBeVisible()
    expect(screen.getByText('Access conditions')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Close Wi-Fi details' }))
    expect(screen.queryByRole('heading', { name: 'Example Harcourt Wi-Fi point' })).not.toBeInTheDocument()
  })

  it('explains unverified coverage and points to a library fallback', async () => {
    renderList('/wifi', 'no-coverage')

    expect(await screen.findByRole('heading', { name: 'No verified Wi-Fi coverage for this area' })).toBeVisible()
    expect(screen.getByText(/local library is a general place/i)).toBeVisible()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it('shows an actionable stale-data warning', async () => {
    renderList('/wifi', 'stale')

    expect(await screen.findByText('This saved Wi-Fi information may be out of date')).toBeVisible()
    expect(screen.getByRole('link', { name: 'update saved information' })).toHaveAttribute(
      'href',
      '/settings/offline-information',
    )
  })

  it('uses plain fallbacks instead of rendering missing fields', async () => {
    renderList('/wifi', 'missing-fields')

    expect(await screen.findByText(/Distance not confirmed/)).toBeVisible()
    expect(screen.getByText('Opening hours not confirmed')).toBeVisible()
    expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument()
  })

  it('explains every missing field on the Wi-Fi detail page', async () => {
    renderDetail('/wifi/example-limited-record', 'missing-fields')

    expect(await screen.findByText('Distance from your postcode is not confirmed')).toBeVisible()
    expect(screen.getByText(/Street address not confirmed/)).toBeVisible()
    expect(screen.getByText('Opening hours not confirmed')).toBeVisible()
    expect(screen.getByText('Access conditions not confirmed')).toBeVisible()
  })

  it('saves a Wi-Fi place with the heart without sending anything', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    renderDetail('/wifi/example-castlemaine', 'default')

    const heart = await screen.findByRole('button', { name: /^Save .* for offline use$/ })
    expect(heart).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(heart)

    expect(screen.getByRole('button', { name: /^Remove .* from saved places$/ })).toHaveAttribute('aria-pressed', 'true')
    expect(getSavedPlace('wifi:example-castlemaine')?.record.id).toBe('example-castlemaine')
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  describe('offline', () => {
    function renderOfflineDetail(path: string) {
      repositoryMocks.getWifiRepository.mockReturnValue({
        list: () => Promise.reject(new Error('No saved information is available for this postcode.')),
      })
      return render(
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/wifi/:id" element={<WifiDetailPage />} />
          </Routes>
        </MemoryRouter>,
      )
    }

    beforeEach(() => {
      Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false })
    })

    afterEach(() => {
      Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
    })

    it('shows a saved Wi-Fi place from the device', async () => {
      savePlace({
        key: 'wifi:example-castlemaine',
        kind: 'wifi',
        record: { id: 'example-castlemaine', placeType: 'wifi', name: 'Saved library Wi-Fi', suburb: 'Castlemaine', dataUpdatedAt: '2026-09-01T00:00:00.000Z' },
      })
      renderOfflineDetail('/wifi/example-castlemaine')

      expect(await screen.findByRole('heading', { name: 'Saved library Wi-Fi' })).toBeVisible()
      expect(screen.getByText(/Details may have changed\. Check before you go\./)).toBeVisible()
      expect(screen.getByText('Distance not saved with this place')).toBeVisible()
      expect(screen.getByRole('button', { name: /Open in maps/ })).toBeDisabled()
    })

    it('explains when an unsaved Wi-Fi place is not on this device', async () => {
      renderOfflineDetail('/wifi/example-castlemaine')

      expect(await screen.findByText("This place isn't saved on this device")).toBeVisible()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })
})
