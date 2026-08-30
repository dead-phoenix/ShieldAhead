import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { storageKeys } from '../../../app/config/product'
import { WifiDetailPage } from './WifiDetailPage'
import { WifiListPage } from './WifiListPage'

function renderList(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <WifiListPage />
    </MemoryRouter>,
  )
}

function renderDetail(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/wifi/:id" element={<WifiDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Epic 2 Wi-Fi states', () => {
  it('explains unverified coverage and points to a library fallback', async () => {
    renderList('/wifi?fixture=no-coverage')

    expect(await screen.findByRole('heading', { name: 'No verified Wi-Fi coverage for this area' })).toBeVisible()
    expect(screen.getByText(/local library is a general place/i)).toBeVisible()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it('shows an actionable stale-data warning', async () => {
    renderList('/wifi?fixture=stale')

    expect(await screen.findByText('This saved Wi-Fi information may be out of date')).toBeVisible()
    expect(screen.getByRole('link', { name: 'update saved information' })).toHaveAttribute(
      'href',
      '/settings/offline-information',
    )
  })

  it('uses plain fallbacks instead of rendering missing fields', async () => {
    renderList('/wifi?fixture=missing-fields')

    expect(await screen.findByText(/Distance not confirmed/)).toBeVisible()
    expect(screen.getByText('Opening hours not confirmed')).toBeVisible()
    expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument()
  })

  it('explains every missing field on the Wi-Fi detail page', async () => {
    renderDetail('/wifi/example-limited-record?fixture=missing-fields')

    expect(await screen.findByText('Distance from your postcode is not confirmed')).toBeVisible()
    expect(screen.getByText(/Street address not confirmed/)).toBeVisible()
    expect(screen.getByText('Opening hours not confirmed')).toBeVisible()
    expect(screen.getByText('Access conditions not confirmed')).toBeVisible()
  })

  it('clears a usual spot that was removed during refresh', async () => {
    window.localStorage.setItem(storageKeys.usualWifiSpot, 'example-harcourt')
    renderList('/wifi?fixture=removed-usual')

    expect(await screen.findByText('Your usual spot is no longer listed')).toBeVisible()
    await waitFor(() => {
      expect(window.localStorage.getItem(storageKeys.usualWifiSpot)).toBeNull()
    })
  })

  it('lets the user remove a usual spot from its details', async () => {
    window.localStorage.setItem(storageKeys.usualWifiSpot, 'example-castlemaine')
    renderDetail('/wifi/example-castlemaine')

    const removeButton = await screen.findByRole('button', {
      name: 'Remove as usual spot',
    })
    fireEvent.click(removeButton)

    expect(window.localStorage.getItem(storageKeys.usualWifiSpot)).toBeNull()
    expect(screen.getByText(/It will now be sorted by distance/i)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Mark as usual spot' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })
})
