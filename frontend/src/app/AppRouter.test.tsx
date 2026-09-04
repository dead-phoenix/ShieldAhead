import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { storageKeys } from './config/product'
import { AppRouter } from './AppRouter'

describe('first-run routing', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/')
  })

  it('sends a new user to setup before showing the home page', async () => {
    render(<AppRouter />)

    expect(await screen.findByRole('heading', {
      name: /Know where to go, even when the network is down/i,
    })).toBeVisible()
    expect(window.location.pathname).toBe('/setup')
  })

  it('protects a direct main-feature link until setup is complete', async () => {
    window.history.replaceState({}, '', '/support')

    render(<AppRouter />)

    expect(await screen.findByRole('heading', {
      name: /Know where to go, even when the network is down/i,
    })).toBeVisible()
    expect(window.location.pathname).toBe('/setup')
  })

  it('shows home to a returning user with a saved profile and consent', async () => {
    window.localStorage.setItem(storageKeys.householdProfile, JSON.stringify({ postcode: '3453' }))
    window.localStorage.setItem(storageKeys.consent, JSON.stringify({
      profileStorageAccepted: true,
      optionalCategories: {},
      updatedAt: '2026-09-04T00:00:00.000Z',
    }))

    render(<AppRouter />)

    expect(await screen.findByRole('heading', { name: 'Choose offline information' })).toBeVisible()
    expect(window.location.pathname).toBe('/')
  })
})
