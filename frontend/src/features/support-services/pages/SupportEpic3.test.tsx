import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { getMockSupportServiceRepository } from '../../../data/mock/mockRepositories'
import { SupportServiceDetailPage } from './SupportServiceDetailPage'
import { SupportServicesPage } from './SupportServicesPage'

const repositoryMocks = vi.hoisted(() => ({
  getSupportServiceRepository: vi.fn(),
}))

vi.mock('../../../data/supportServiceRepository', () => ({
  getSupportServiceRepository: repositoryMocks.getSupportServiceRepository,
}))

vi.mock('../../../shared/map/LazyMapView', () => ({
  LazyMapView: ({ ariaLabel, markers, onSelect }: { ariaLabel: string; markers: Array<{ id: string; name: string }>; onSelect: (ids: string[]) => void }) => (
    <div aria-label={ariaLabel} role="region">
      {markers.map((marker) => <button key={marker.id} type="button" onClick={() => onSelect([marker.id])}>{marker.name}</button>)}
    </div>
  ),
}))

function renderList(path: string, fixture: Parameters<typeof getMockSupportServiceRepository>[0]) {
  repositoryMocks.getSupportServiceRepository.mockReturnValue(getMockSupportServiceRepository(fixture))
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SupportServicesPage />
    </MemoryRouter>,
  )
}

function renderDetail(path: string, fixture: Parameters<typeof getMockSupportServiceRepository>[0]) {
  repositoryMocks.getSupportServiceRepository.mockReturnValue(getMockSupportServiceRepository(fixture))
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/support/:id" element={<SupportServiceDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Epic 3 support-service states', () => {
  it('switches to an embedded map and shows in-app service details', async () => {
    renderList('/support', 'default')

    fireEvent.click(await screen.findByRole('button', { name: 'Map' }))

    expect(await screen.findByRole('region', { name: /map of nearby support services/i })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Example Food Relief Service' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Example Food Relief Service' }))
    expect(screen.getByRole('heading', { name: 'Example Food Relief Service' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Eligibility' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Services offered' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Close service details' }))
    expect(screen.queryByRole('heading', { name: 'Example Food Relief Service' })).not.toBeInTheDocument()
  })

  it('shows a distinct no-nearby state with a postcode recovery action', async () => {
    renderList('/support', 'no-nearby')

    expect(await screen.findByRole('heading', { name: 'No nearby support services are listed' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Check your postcode' })).toHaveAttribute(
      'href',
      '/settings/edit-profile',
    )
    expect(screen.queryByText('No services match this filter. Try another category.')).not.toBeInTheDocument()
  })

  it('uses plain list fallbacks when published fields are missing', async () => {
    renderList('/support', 'missing-fields')

    expect(await screen.findByText(/Street address not confirmed/)).toBeVisible()
    expect(screen.getByText(/Distance not confirmed/)).toBeVisible()
    expect(screen.getByText(/Phone not published/)).toBeVisible()
    expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument()
  })

  it('explains every missing field on the service detail page', async () => {
    renderDetail('/support/example-limited-support-record', 'missing-fields')

    expect(await screen.findByText(/Distance from your postcode is not confirmed/)).toBeVisible()
    expect(screen.getByText('Phone not published')).toBeVisible()
    expect(screen.getByText('Website not published')).toBeVisible()
    expect(screen.getByText(/Street address not confirmed/)).toBeVisible()
    expect(screen.getByText(/Eligibility information has not been published/)).toBeVisible()
  })

  it('renders normal, low and closed partner updates distinctly', async () => {
    renderList('/support', 'partner-states')

    expect(await screen.findByText('Normal availability — partner update')).toBeVisible()
    expect(screen.getByText('Low availability — partner update')).toBeVisible()
    expect(screen.getByText('Closed — partner update')).toBeVisible()
  })

  it('keeps partner status consistent on the detail page', async () => {
    renderDetail('/support/example-partner-low', 'partner-states')

    expect(await screen.findByText('Low availability — partner update')).toBeVisible()
    expect(screen.getByText(/Call ahead before travelling/)).toBeVisible()
  })

  it('shows both dataset and partner-status stale warnings', async () => {
    renderList('/support', 'stale')

    expect(await screen.findByText('This saved support information may be out of date')).toBeVisible()
    expect(screen.getByText('Normal availability — older update')).toBeVisible()
  })

  it('supports long names, referral requirements and visit limits', async () => {
    renderDetail('/support/example-long-content', 'long-content')

    expect(await screen.findByRole('heading', { name: /Example Loddon Campaspe Community/ })).toBeVisible()
    expect(screen.getByText(/referral from a local health, housing or community worker is required/i)).toBeVisible()
    expect(screen.getByText(/once every four weeks/i)).toBeVisible()
  })

  it('explains when a direct detail URL no longer matches the current dataset', async () => {
    renderDetail('/support/acnc-removed-record', 'default')

    expect(await screen.findByRole('heading', { name: 'This service could not be found' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'View nearby services' })).toHaveAttribute(
      'href',
      '/support',
    )
  })

  it('keeps filtered-empty feedback separate from dataset-empty feedback', async () => {
    renderList('/support', 'default')
    const emergencyFilter = await screen.findByRole('button', { name: 'Emergency' })
    fireEvent.click(emergencyFilter)

    expect(screen.getByRole('heading', { name: 'Example Community Support Service' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'No nearby support services are listed' })).not.toBeInTheDocument()
  })

  it('supports multiple service filters and keeps the active filters visible', async () => {
    renderList('/support', 'default')

    const foodFilter = await screen.findByRole('button', { name: 'Food' })
    const emergencyFilter = screen.getByRole('button', { name: 'Emergency' })
    fireEvent.click(foodFilter)
    fireEvent.click(emergencyFilter)

    expect(foodFilter).toHaveAttribute('aria-pressed', 'true')
    expect(emergencyFilter).toHaveAttribute('aria-pressed', 'true')
    const filterStatus = screen.getByRole('status')
    expect(filterStatus).toHaveTextContent('Food, Emergency')
    expect(filterStatus).toHaveTextContent('Showing 2 of 3 services')
    expect(screen.getByRole('heading', { name: 'Example Food Relief Service' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Example Community Support Service' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Example Housing Support Service' })).not.toBeInTheDocument()
  })

  it('applies the same filters to map markers and clears them in one action', async () => {
    renderList('/support', 'default')

    fireEvent.click(await screen.findByRole('button', { name: 'Food' }))
    fireEvent.click(screen.getByRole('button', { name: 'Map' }))

    const map = await screen.findByRole('region', { name: /map of nearby support services/i })
    expect(map).toHaveTextContent('Example Food Relief Service')
    expect(map).not.toHaveTextContent('Example Community Support Service')

    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))

    expect(map).toHaveTextContent('Example Food Relief Service')
    expect(map).toHaveTextContent('Example Community Support Service')
    expect(map).toHaveTextContent('Example Housing Support Service')
    expect(screen.getByRole('button', { name: 'All services' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText(/Active filters:/)).not.toBeInTheDocument()
  })

  it('filters housing and homelessness classifications consistently in list and map views', async () => {
    renderList('/support', 'default')

    const housingFilter = await screen.findByRole('button', { name: 'Housing' })
    fireEvent.click(housingFilter)

    expect(housingFilter).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: 'Example Housing Support Service' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Example Food Relief Service' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Showing 1 of 3 services')

    fireEvent.click(screen.getByRole('button', { name: 'Map' }))

    const map = await screen.findByRole('region', { name: /map of nearby support services/i })
    expect(map).toHaveTextContent('Example Housing Support Service')
    expect(map).not.toHaveTextContent('Example Food Relief Service')
    expect(map).not.toHaveTextContent('Example Community Support Service')
  })
})
