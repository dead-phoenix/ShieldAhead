import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { SupportServiceDetailPage } from './SupportServiceDetailPage'
import { SupportServicesPage } from './SupportServicesPage'

function renderList(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SupportServicesPage />
    </MemoryRouter>,
  )
}

function renderDetail(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/support/:id" element={<SupportServiceDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Epic 3 support-service states', () => {
  it('shows a distinct no-nearby state with a postcode recovery action', async () => {
    renderList('/support?fixture=no-nearby')

    expect(await screen.findByRole('heading', { name: 'No nearby support services are listed' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Check your postcode' })).toHaveAttribute(
      'href',
      '/settings/edit-profile',
    )
    expect(screen.queryByText('No example services match this filter. Try another category.')).not.toBeInTheDocument()
  })

  it('uses plain list fallbacks when published fields are missing', async () => {
    renderList('/support?fixture=missing-fields')

    expect(await screen.findByText(/Street address not confirmed/)).toBeVisible()
    expect(screen.getByText(/Distance not confirmed/)).toBeVisible()
    expect(screen.getByText(/Phone not published/)).toBeVisible()
    expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument()
  })

  it('explains every missing field on the service detail page', async () => {
    renderDetail('/support/example-limited-support-record?fixture=missing-fields')

    expect(await screen.findByText(/Distance from your postcode is not confirmed/)).toBeVisible()
    expect(screen.getByText('Phone not published')).toBeVisible()
    expect(screen.getByText('Website not published')).toBeVisible()
    expect(screen.getByText(/Street address not confirmed/)).toBeVisible()
    expect(screen.getByText(/Eligibility information has not been published/)).toBeVisible()
  })

  it('renders normal, low and closed partner updates distinctly', async () => {
    renderList('/support?fixture=partner-states')

    expect(await screen.findByText('Normal availability — example partner update')).toBeVisible()
    expect(screen.getByText('Low availability — example partner update')).toBeVisible()
    expect(screen.getByText('Closed — example partner update')).toBeVisible()
  })

  it('keeps partner status consistent on the detail page', async () => {
    renderDetail('/support/example-partner-low?fixture=partner-states')

    expect(await screen.findByText('Low availability — example partner update')).toBeVisible()
    expect(screen.getByText(/Call ahead before travelling/)).toBeVisible()
  })

  it('shows both dataset and partner-status stale warnings', async () => {
    renderList('/support?fixture=stale')

    expect(await screen.findByText('This saved support information may be out of date')).toBeVisible()
    expect(screen.getByText('Normal availability — old example update')).toBeVisible()
  })

  it('supports long names, referral requirements and visit limits', async () => {
    renderDetail('/support/example-long-content?fixture=long-content')

    expect(await screen.findByRole('heading', { name: /Example Loddon Campaspe Community/ })).toBeVisible()
    expect(screen.getByText(/referral from a local health, housing or community worker is required/i)).toBeVisible()
    expect(screen.getByText(/once every four weeks/i)).toBeVisible()
  })

  it('keeps filtered-empty feedback separate from dataset-empty feedback', async () => {
    renderList('/support')
    const emergencyFilter = await screen.findByRole('button', { name: 'Emergency' })
    fireEvent.click(emergencyFilter)

    expect(screen.getByRole('heading', { name: 'Example Community Support Service' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'No nearby support services are listed' })).not.toBeInTheDocument()
  })
})
