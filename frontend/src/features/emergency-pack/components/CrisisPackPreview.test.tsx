import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { buildCrisisPack } from '../buildCrisisPack'
import { emptyEmergencyPackSnapshot, type EmergencyPackPreferences } from '../emergencyPackStorage'
import { CrisisPackPreview } from './CrisisPackPreview'

vi.mock('../crisisPackSources', () => ({
  crisisPackSources: {
    bushfire: [],
    flood: [{ label: 'Example flood source', url: 'https://example.org/flood' }],
    'power-outage': [],
  },
}))

const downloadedAt = new Date(2026, 9, 5, 12)

const everything: EmergencyPackPreferences = {
  includeHelplines: true,
  includeWifi: true,
  includeCharities: true,
  crises: ['bushfire', 'flood'],
}

function renderPreview(preferences: EmergencyPackPreferences = everything) {
  const pack = buildCrisisPack({
    preferences,
    snapshot: {
      ...emptyEmergencyPackSnapshot(),
      placesSavedAt: { wifi: '2026-10-05T00:00:00.000Z' },
      wifi: [
        { id: 'w1', name: 'LIBRARY AT THE DOCK', address: '107 Victoria Harbour Prom', suburb: 'Docklands', postcode: '3008' },
        { id: 'w2', name: 'Pop-up hotspot', suburb: 'Area not confirmed', postcode: '' },
      ],
    },
    downloadedAt,
  })
  render(<CrisisPackPreview pack={pack} />)
}

describe('Crisis pack preview', () => {
  it('renders every page from the page list with an accessible summary and page footers', () => {
    renderPreview()
    const preview = screen.getByRole('region', { name: 'Crisis pack preview' })
    expect(preview).toHaveAccessibleDescription('Preview: 4 pages. Get help, Bushfire checklist, Flood checklist, My emergency contacts.')

    const pages = within(preview).getAllByRole('region', { name: /^Page \d of 4/ })
    expect(pages).toHaveLength(4)
    expect(within(pages[0]).getByText('ShieldAhead')).toBeInTheDocument()
    expect(within(pages[3]).getByText('4 of 4')).toBeInTheDocument()
  })

  it('shows helplines, numbered places, the offline fallback and the freshness note on page 1', () => {
    renderPreview()
    const page = screen.getByRole('region', { name: 'Page 1 of 4: Get help' })
    expect(within(page).getByRole('heading', { name: 'Your crisis pack' })).toBeInTheDocument()
    expect(within(page).getByText('Name and date')).toBeInTheDocument()
    expect(within(page).getByRole('heading', { name: 'Helplines' })).toBeInTheDocument()
    expect(within(page).getByText('000')).toBeInTheDocument()
    expect(within(page).getByText('For life-threatening danger')).toBeInTheDocument()

    const wifi = within(page).getByRole('heading', { name: 'Wi-Fi spots' }).closest('section') as HTMLElement
    const rows = within(wifi).getAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual([
      'Library at the Dock107 Victoria Harbour Prom, Docklands 3008',
      'Pop-up hotspot',
    ])

    const charities = within(page).getByRole('heading', { name: 'Charities' }).closest('section') as HTMLElement
    expect(within(charities).getByText('Not available offline')).toBeInTheDocument()
    expect(within(page).getByText(/Details were correct when this pack was downloaded on 5 October 2026/)).toBeInTheDocument()
  })

  it('renders tick boxes with short titles and prints sources only where they exist', () => {
    renderPreview()
    const bushfire = screen.getByRole('region', { name: 'Page 2 of 4: Bushfire checklist' })
    expect(within(bushfire).getByText('Tick each one when it is done')).toBeInTheDocument()
    expect(within(bushfire).getAllByRole('listitem')).toHaveLength(8)
    expect(within(bushfire).queryByRole('heading', { name: 'Sources' })).not.toBeInTheDocument()

    const flood = screen.getByRole('region', { name: 'Page 3 of 4: Flood checklist' })
    expect(within(flood).getByText('Example flood source: https://example.org/flood')).toBeInTheDocument()
  })

  it('leaves the contacts page blank for handwriting', () => {
    renderPreview({ includeHelplines: false, includeWifi: false, includeCharities: false, crises: [] })
    const page = screen.getByRole('region', { name: 'Page 1 of 1: My emergency contacts' })
    const rows = within(within(page).getByRole('table')).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(6)
    expect(rows.every((row) => row.textContent === '')).toBe(true)
    expect(within(page).getByText('Meeting place')).toBeInTheDocument()
    expect(within(page).getByText('Contact outside the area')).toBeInTheDocument()
  })
})
