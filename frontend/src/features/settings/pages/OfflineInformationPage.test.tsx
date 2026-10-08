import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prepareOffline } from '../../../data/offline/prepareOffline'
import { getMyArea } from '../../../storage/myAreaStorage'
import { OfflineInformationPage } from './OfflineInformationPage'

vi.mock('../../../data/offline/prepareOffline', () => ({ prepareOffline: vi.fn() }))
vi.mock('../../../storage/myAreaStorage', () => ({ getMyArea: vi.fn() }))

function renderPage() {
  return render(<MemoryRouter><OfflineInformationPage /></MemoryRouter>)
}

beforeEach(() => {
  vi.mocked(getMyArea).mockReturnValue({ postcode: '3450', label: 'Castlemaine 3450', savedAt: '2026-01-01T00:00:00.000Z' })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('OfflineInformationPage', () => {
  it('prompts to set My area first when none is saved', () => {
    vi.mocked(getMyArea).mockReturnValue(null)
    renderPage()

    expect(screen.getByText((_, element) => element?.tagName === 'P' && /Set\s*My area\s*first/.test(element.textContent ?? ''))).toBeVisible()
  })

  it('shows Ready offline after a successful save', async () => {
    vi.mocked(prepareOffline).mockResolvedValue({
      status: 'ready',
      missingUrls: [],
      checkedAt: '2026-01-02T00:00:00.000Z',
    })
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: /Save nearby services for offline use/ }))

    expect(await screen.findByText('Ready offline')).toBeVisible()
    expect(screen.getByRole('button', { name: /Retry/ })).toBeVisible()
  })

  it('shows what is missing when only partly ready', async () => {
    vi.mocked(prepareOffline).mockResolvedValue({
      status: 'partial',
      missingUrls: ['/data/offline-charities.json'],
      checkedAt: '2026-01-02T00:00:00.000Z',
    })
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: /Save nearby services for offline use/ }))

    expect(await screen.findByText('Partly ready')).toBeVisible()
    expect(screen.getByText(/1 file still missing/)).toBeVisible()
  })

  it('warns when the browser did not grant persistent storage', async () => {
    vi.mocked(prepareOffline).mockResolvedValue({
      status: 'ready',
      missingUrls: [],
      persisted: false,
      checkedAt: '2026-01-02T00:00:00.000Z',
    })
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: /Save nearby services for offline use/ }))

    expect(await screen.findByText(/did not grant persistent storage/)).toBeVisible()
  })
})
