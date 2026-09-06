import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { ChooseLocationPage } from './ChooseLocationPage'
import { storageKeys } from '../../../app/config/product'

function renderLocation(next = '/wifi') {
  return render(
    <MemoryRouter initialEntries={[`/location?next=${encodeURIComponent(next)}`]}>
      <ChooseLocationPage />
    </MemoryRouter>,
  )
}

describe('choose location page', () => {
  it('saves a typed Victorian postcode and uses it for later searches', async () => {
    renderLocation('/support')

    fireEvent.change(screen.getByLabelText('Suburb or postcode'), { target: { value: '3453' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() => {
      expect(window.localStorage.getItem(storageKeys.searchLocation)).toContain('3453')
    })
  })

  it('explains that location stays on the device', () => {
    renderLocation()

    expect(screen.getByRole('heading', { name: 'Find places near you' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Use my current location' })).toBeVisible()
    expect(screen.getByText('Your location stays on this device and is never sent to a server.')).toBeVisible()
  })
})
