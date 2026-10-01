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
      datasets: [],
      sourceErrors: [],
      generatedAt: '2026-09-30T00:00:00.000Z',
      limitations: [],
      dataOrigin: 'network',
    }),
  }),
}))

vi.mock('../../../data/api/apiCrisisRepository', () => ({
  fetchHelplines: vi.fn().mockResolvedValue([
    { id: 'ses', name: 'VICSES', serviceType: 'Flood assistance', phone: '132 500' },
  ]),
  fetchChecklistItems: vi.fn(async (kind: string) => kind === 'bushfire' ? [{
    id: 'bushfire.plan-reviewed',
    crisisType: 'bushfire',
    category: 'Household plan and essentials',
    categoryId: 'household-plan',
    itemId: 'plan-reviewed',
    task: 'Review the household bushfire plan',
    description: 'Read it with everyone at home.',
    steps: [],
    displayOrder: 1,
    isActive: true,
  }] : []),
}))

describe('Emergency pack page', () => {
  beforeEach(() => {
    window.localStorage.clear()
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
    window.localStorage.setItem(storageKeys.searchLocation, JSON.stringify({
      postcode: '3453',
      label: 'Harcourt 3453',
      selectedAt: '2026-10-01T00:00:00.000Z',
    }))
  })

  it('builds a printable pack from the selected sections and leaves contact lines blank', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    render(<MemoryRouter><EmergencyPackPage /></MemoryRouter>)

    expect(screen.getByRole('heading', { level: 1, name: 'Emergency pack' })).toBeVisible()
    expect(await screen.findByText('Wi-Fi 1')).toBeVisible()
    expect(screen.getByText('Wi-Fi 5')).toBeVisible()
    expect(screen.queryByText('Wi-Fi 9')).not.toBeInTheDocument()
    expect(screen.getByText('Community House')).toBeVisible()
    expect(screen.getByText('132 500')).toBeVisible()
    expect(screen.getByText('Review the household bushfire plan')).toBeVisible()
    expect(screen.getByText('Do not wait until you can see flames or smell smoke.')).toBeVisible()

    const contacts = screen.getByRole('table')
    const rows = within(contacts).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(6)
    expect(rows.every((row) => row.textContent === '')).toBe(true)
    expect(screen.getByText(/write names and phone numbers by hand/i)).toBeVisible()

    fireEvent.click(screen.getByRole('checkbox', { name: /Bushfire/ }))
    expect(screen.queryByText('Review the household bushfire plan')).not.toBeInTheDocument()
    expect(screen.queryByText('Do not wait until you can see flames or smell smoke.')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }))
    fireEvent.click(screen.getByRole('button', { name: 'Print' }))
    expect(print).toHaveBeenCalledTimes(2)
  })
})
