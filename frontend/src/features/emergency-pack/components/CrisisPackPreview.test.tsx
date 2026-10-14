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
      areaLabel: 'Docklands 3008',
      postcode: '3008',
      savedAt: '2026-10-05T00:00:00.000Z',
      placesSavedAt: { wifi: '2026-10-05T00:00:00.000Z' },
      wifi: [
        { id: 'w1', name: 'LIBRARY AT THE DOCK', address: '107 Victoria Harbour Prom', suburb: 'Docklands', postcode: '3008' },
        { id: 'w2', name: 'Pop-up hotspot', suburb: 'Area not confirmed', postcode: '' },
      ],
    },
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
    for (const page of pages) {
      expect(within(page).getByText('Built for Docklands 3008 · Saved 5 October 2026')).toBeInTheDocument()
    }
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

    expect(within(page).getByText('Near Docklands 3008')).toBeInTheDocument()
    const charities = within(page).getByRole('heading', { name: 'Charities near you' }).closest('section') as HTMLElement
    expect(within(charities).getByText('Not available offline')).toBeInTheDocument()
    expect(within(page).getByText(/Details were correct when this pack was saved on 5 October 2026/)).toBeInTheDocument()
  })

  it('renders the crisis page checklist groups with tick boxes and prints sources only where they exist', () => {
    renderPreview()
    const bushfire = screen.getByRole('region', { name: 'Page 2 of 4: Bushfire checklist' })
    expect(within(bushfire).getByRole('heading', { name: 'Bushfire Household Checklist' })).toBeInTheDocument()
    expect(within(bushfire).getByText('Tick each one when it is done')).toBeInTheDocument()
    expect(within(bushfire).getByRole('heading', { name: 'Children and pets' })).toBeInTheDocument()
    expect(bushfire.querySelectorAll('.pack-tick-list > li')).toHaveLength(8)
    expect(within(bushfire).getByText('Write down your bushfire plan')).toBeInTheDocument()
    expect(within(bushfire).queryByRole('heading', { name: 'Sources' })).not.toBeInTheDocument()

    const flood = screen.getByRole('region', { name: 'Page 3 of 4: Flood checklist' })
    expect(within(flood).getByText('Example flood source: https://example.org/flood')).toBeInTheDocument()
  })

  it('prints what to do and what not to do beneath the checklist on the same page', () => {
    renderPreview()
    const page = screen.getByRole('region', { name: 'Page 2 of 4: Bushfire checklist' })
    const dos = within(page).getByRole('heading', { name: 'What to do' }).closest('section') as HTMLElement
    const donts = within(page).getByRole('heading', { name: 'What not to do' }).closest('section') as HTMLElement
    expect(within(dos).getAllByRole('listitem')).toHaveLength(4)
    expect(within(donts).getByText('Do not wait until you can see flames or smell smoke.')).toBeInTheDocument()
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
