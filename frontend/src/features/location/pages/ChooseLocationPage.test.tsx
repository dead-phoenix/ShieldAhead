import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { ChooseLocationPage } from './ChooseLocationPage'
import { storageKeys } from '../../../app/config/product'

function renderLocation(next = '/map') {
  return render(
    <MemoryRouter initialEntries={[`/location?next=${encodeURIComponent(next)}`]}>
      <ChooseLocationPage />
    </MemoryRouter>,
  )
}

describe('choose location page', () => {
  it('saves a typed Victorian postcode and uses it for later searches', async () => {
    renderLocation('/support')

    fireEvent.change(screen.getByLabelText('Address, suburb, or postcode'), { target: { value: '3453' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() => {
      expect(window.localStorage.getItem(storageKeys.searchLocation)).toContain('3453')
    })
  })

  it('explains how the selected area and current location are handled', () => {
    renderLocation()

    expect(screen.getByRole('heading', { name: 'Find places near you' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Use my current location' })).toBeVisible()
    expect(screen.getByText(/Your chosen area is saved on this device/)).toBeVisible()
    expect(screen.getByText(/sent to our location service only to identify the nearby area/)).toBeVisible()
  })

  it('uses one location step for the unified Map', () => {
    renderLocation()

    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.getByText(/nearby Wi-Fi or support services/)).toBeVisible()
  })
})
