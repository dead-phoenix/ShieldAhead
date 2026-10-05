import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { storageKeys } from '../../../app/config/product'
import { EmergencyPackPage } from './EmergencyPackPage'

vi.mock('../../map/data/mapPlaceRepository', () => ({
  getMapPlaceRepository: () => ({
    findNearby: vi.fn().mockResolvedValue({
      places: [
        ...[1, 2, 3, 4, 5, 9].map((distanceKm) => ({
          id: `wifi:${distanceKm}`,
          sourceId: String(distanceKm),
          source: 'wifi',
          kind: 'wifi',
          name: `Wi-Fi ${distanceKm}`,
          postcode: '3453',
          suburb: 'Harcourt',
          distanceKm,
          dataUpdatedAt: '2026-09-30T00:00:00.000Z',
          dataOrigin: 'network',
        })),
        {
          id: 'support:1',
          sourceId: '1',
          source: 'support',
          kind: 'support',
          name: 'Community House',
          phone: '03 5555 0100',
          postcode: '3453',
          suburb: 'Harcourt',
          distanceKm: 1,
          dataUpdatedAt: '2026-09-30T00:00:00.000Z',
          dataOrigin: 'network',
        },
      ],
      datasets: [{ source: 'wifi', metadata: {} }, { source: 'support', metadata: {} }],
      sourceErrors: [],
      generatedAt: '2026-09-30T00:00:00.000Z',
      limitations: [],
      dataOrigin: 'network',
    }),
  }),
}))

vi.mock('../../../data/api/apiCrisisRepository', () => ({
  fetchHelplines: vi.fn().mockResolvedValue([
    { id: 'vicemergency', name: 'VicEmergency Hotline', serviceType: 'Emergency information', phone: '1800 226 226' },
  ]),
  fetchChecklistItems: vi.fn().mockResolvedValue([]),
}))

const toggleNames = ['Helplines', 'Wi-Fi spots', 'Charities', 'Bushfire', 'Flood', 'Power outage']

function renderPage() {
  return render(<MemoryRouter><EmergencyPackPage /></MemoryRouter>)
}

function preview() {
  return screen.getByRole('region', { name: 'Crisis pack preview' })
}

function pageRegions() {
  return within(preview()).getAllByRole('region', { name: /^Page \d+ of \d+/ })
}

describe('Crisis pack page', () => {
  beforeEach(() => {
    window.localStorage.clear()
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
    window.localStorage.setItem(storageKeys.searchLocation, JSON.stringify({
      postcode: '3453',
      label: 'Harcourt 3453',
      selectedAt: '2026-10-01T00:00:00.000Z',
    }))
  })

  it('shows six pressed toggles by default and the full preview', async () => {
    document.title = 'ShieldAhead'
    const { unmount } = renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Crisis pack' })).toBeVisible()
    expect(document.title).toBe('Crisis pack')
    for (const name of toggleNames) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true')
    }

    expect(await within(preview()).findByText('Wi-Fi 1')).toBeVisible()
    expect(within(preview()).queryByText('Wi-Fi 9')).not.toBeInTheDocument()
    expect(within(preview()).getByText('Near Harcourt 3453')).toBeVisible()
    expect(preview()).toHaveAccessibleDescription(
      'Preview: 5 pages. Get help, Bushfire checklist, Flood checklist, Power outage checklist, My emergency contacts.',
    )
    unmount()
    expect(document.title).toBe('ShieldAhead')
  })

  it('adds and removes the Flood checklist page and updates the count', async () => {
    renderPage()
    await within(preview()).findByText('Wi-Fi 1')
    const flood = screen.getByRole('button', { name: 'Flood' })

    fireEvent.click(flood)
    expect(flood).toHaveAttribute('aria-pressed', 'false')
    expect(pageRegions()).toHaveLength(4)
    expect(within(preview()).queryByRole('heading', { name: 'Flood checklist' })).not.toBeInTheDocument()
    const announcement = within(preview()).getByText(/^Preview: \d+ pages?\./)
    expect(announcement).toHaveAttribute('aria-live', 'polite')
    expect(announcement).toHaveTextContent(
      'Preview: 4 pages. Get help, Bushfire checklist, Power outage checklist, My emergency contacts.',
    )

    fireEvent.click(flood)
    expect(flood).toHaveAttribute('aria-pressed', 'true')
    expect(pageRegions()).toHaveLength(5)
    expect(within(preview()).getByRole('heading', { name: 'Flood checklist' })).toBeVisible()
    expect(within(preview()).getByRole('region', { name: 'Page 3 of 5: Flood checklist' })).toBeInTheDocument()
  })

  it('leaves only the contacts page when every toggle is off', async () => {
    renderPage()
    await within(preview()).findByText('Wi-Fi 1')
    for (const name of toggleNames) fireEvent.click(screen.getByRole('button', { name }))

    for (const name of toggleNames) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false')
    }
    expect(pageRegions()).toHaveLength(1)
    expect(preview()).toHaveAccessibleDescription('Preview: 1 page. My emergency contacts.')
    const rows = within(within(preview()).getByRole('table')).getAllByRole('row').slice(1)
    expect(rows.every((row) => row.textContent === '')).toBe(true)
  })

  it('keeps toggle choices after the page is opened again', async () => {
    const { unmount } = renderPage()
    await within(preview()).findByText('Wi-Fi 1')
    fireEvent.click(screen.getByRole('button', { name: 'Charities' }))
    fireEvent.click(screen.getByRole('button', { name: 'Power outage' }))
    unmount()

    renderPage()
    expect(screen.getByRole('button', { name: 'Charities' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Power outage' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Wi-Fi spots' })).toHaveAttribute('aria-pressed', 'true')
    await within(preview()).findByText('Wi-Fi 1')
  })

  it('migrates the old single nearby setting to both place toggles', async () => {
    window.localStorage.setItem(storageKeys.emergencyPack, JSON.stringify({
      preferences: { includeNearby: false, includeHelplines: true, crises: ['flood'] },
    }))
    renderPage()
    expect(screen.getByRole('button', { name: 'Wi-Fi spots' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Charities' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Helplines' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Bushfire' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Flood' })).toHaveAttribute('aria-pressed', 'true')
    await screen.findByText('1800 226 226')
  })

  it('offers a single download button with a clear label', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    renderPage()
    await within(preview()).findByText('Wi-Fi 1')
    const download = screen.getByRole('button', { name: 'Download crisis pack as PDF' })
    expect(screen.queryByRole('button', { name: /print/i })).not.toBeInTheDocument()
    fireEvent.click(download)
    expect(print).toHaveBeenCalledTimes(1)
  })
})
