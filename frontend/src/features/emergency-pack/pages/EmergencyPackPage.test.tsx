import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { storageKeys } from '../../../app/config/product'
import { buildNearbySnapshot } from '../../../data/offline/nearbySnapshot'
import { fixtureBundle } from '../../../test/nearbyFixtures'
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

vi.mock('../../../data/preloadNearbyData', () => ({
  preloadNearbyData: vi.fn(),
}))

vi.mock('../../../data/offline/offlineDataLoader', () => ({
  lookupLocalities: vi.fn().mockResolvedValue(null),
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
    window.localStorage.setItem(storageKeys.myArea, JSON.stringify({
      postcode: '3453',
      label: 'Harcourt 3453',
      savedAt: '2026-10-01T00:00:00.000Z',
    }))
  })

  it('builds the pack for My area, not for the last map search', async () => {
    window.localStorage.setItem(storageKeys.searchLocation, JSON.stringify({
      postcode: '3550',
      label: 'Bendigo 3550',
      selectedAt: '2026-10-02T00:00:00.000Z',
    }))
    renderPage()
    await within(preview()).findByText('Wi-Fi 1')

    expect(screen.getByText('Harcourt 3453', { selector: 'strong' })).toBeVisible()
    expect(within(preview()).getByText('Near Harcourt 3453')).toBeVisible()
    expect(within(preview()).queryByText(/Bendigo/)).not.toBeInTheDocument()
    expect(JSON.parse(window.localStorage.getItem(storageKeys.emergencyPack)!).snapshot.postcode).toBe('3453')
  })

  it('prints the area and saved date in every page footer', async () => {
    renderPage()
    await within(preview()).findByText('Wi-Fi 1')
    const today = new Intl.DateTimeFormat('en-AU', { dateStyle: 'long' }).format(new Date())

    for (const page of pageRegions()) {
      expect(within(page).getByText(`Built for Harcourt 3453 · Saved ${today}`)).toBeInTheDocument()
    }
    expect(within(preview()).getByText(`Details were correct when this pack was saved on ${today}. Check before relying on them.`)).toBeVisible()
  })

  it('shows the area search inline on the page when My area is not set, then offers a ready download', async () => {
    window.localStorage.removeItem(storageKeys.myArea)
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    renderPage()
    expect(screen.getByText('Set your area so this pack and the Support map can find nearby help.')).toBeVisible()
    const download = screen.getByRole('button', { name: 'Download crisis pack as PDF' })
    expect(download).toBeVisible()

    fireEvent.click(download)
    expect(print).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Address, suburb, or postcode')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Use my current location' })).toBeVisible()

    fireEvent.change(screen.getByLabelText('Address, suburb, or postcode'), { target: { value: '3453' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    const ready = await screen.findByRole('button', { name: 'Ready. Download pack' })
    expect(JSON.parse(window.localStorage.getItem(storageKeys.myArea)!)).toMatchObject({ postcode: '3453', label: '3453' })
    expect(print).not.toHaveBeenCalled()
    fireEvent.click(ready)
    expect(print).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Download crisis pack as PDF' })).toBeVisible()
    print.mockRestore()
  })

  it('lets you change My area inline without leaving the page or losing the download button', async () => {
    renderPage()
    await within(preview()).findByText('Wi-Fi 1')
    expect(screen.getByText('Harcourt 3453', { selector: 'strong' })).toBeVisible()
    expect(screen.queryByLabelText('Address, suburb, or postcode')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    expect(screen.getByLabelText('Address, suburb, or postcode')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Download crisis pack as PDF' })).toBeVisible()
  })

  it('puts My area at the top of the page, before the pack toggles', async () => {
    renderPage()
    await within(preview()).findByText('Wi-Fi 1')
    const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)
    expect(headings.indexOf('My area')).toBeLessThan(headings.indexOf('Get help'))
    expect(headings.indexOf('My area')).toBeLessThan(headings.indexOf('Checklists'))
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
    expect(within(preview()).queryByRole('heading', { name: 'Flood Household Checklist' })).not.toBeInTheDocument()
    const announcement = within(preview()).getByText(/^Preview: \d+ pages?\./)
    expect(announcement).toHaveAttribute('aria-live', 'polite')
    expect(announcement).toHaveTextContent(
      'Preview: 4 pages. Get help, Bushfire checklist, Power outage checklist, My emergency contacts.',
    )

    fireEvent.click(flood)
    expect(flood).toHaveAttribute('aria-pressed', 'true')
    expect(pageRegions()).toHaveLength(5)
    expect(within(preview()).getByRole('heading', { name: 'Flood Household Checklist' })).toBeVisible()
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

  it('adds the saved nearby services page when a snapshot exists', async () => {
    const area = { postcode: '3453', localityId: 'loc-harcourt', localityName: 'Harcourt', label: 'Harcourt 3453', savedAt: '' }
    window.localStorage.setItem(storageKeys.myArea, JSON.stringify(area))
    window.localStorage.setItem(storageKeys.nearbySnapshot, JSON.stringify(buildNearbySnapshot(area, fixtureBundle())))
    renderPage()
    await within(preview()).findByText('Wi-Fi 1')

    const nearbyPage = within(preview()).getByRole('region', { name: 'Page 2 of 6: Nearby services' })
    expect(within(nearbyPage).getByRole('heading', { name: 'Saved nearby services' })).toBeVisible()
    expect(within(nearbyPage).getByText('Near Harcourt 3453')).toBeVisible()
    expect(within(nearbyPage).getByText('Harcourt Fire Station')).toBeVisible()
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
