import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { storageKeys } from './config/product'
import { AppRouter } from './AppRouter'

describe('first-run routing', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/')
  })

  it('shows the home page to a new visitor, with log in and sign up', async () => {
    render(<AppRouter />)

    expect(await screen.findByRole('heading', { name: /Local help.*Within reach/i })).toBeVisible()
    expect(window.location.pathname).toBe('/')
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/setup')
    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/setup')
  })

  it('asks for a search area before opening support', async () => {
    window.history.replaceState({}, '', '/support')

    render(<AppRouter />)

    expect(await screen.findByRole('heading', { name: 'Find places near you' })).toBeVisible()
    expect(window.location.pathname).toBe('/location')
  })

  it('opens support after a search area is saved', async () => {
    window.localStorage.setItem(storageKeys.searchLocation, JSON.stringify({
      postcode: '3453',
      label: 'Harcourt 3453',
    }))
    window.history.replaceState({}, '', '/support')

    render(<AppRouter />)

    expect(await screen.findByRole('heading', { name: 'Nearby support services' })).toBeVisible()
    expect(window.location.pathname).toBe('/support')
  })

  it('shows home to a returning user with a saved profile and consent', async () => {
    window.localStorage.setItem(storageKeys.householdProfile, JSON.stringify({ postcode: '3453' }))
    window.localStorage.setItem(storageKeys.consent, JSON.stringify({
      profileStorageAccepted: true,
      optionalCategories: {},
      updatedAt: '2026-09-04T00:00:00.000Z',
    }))

    render(<AppRouter />)

    expect(await screen.findByRole('heading', { name: /Local help.*Within reach/i })).toBeVisible()
    expect(window.location.pathname).toBe('/')
    expect(screen.queryByRole('link', { name: 'Sign up' })).not.toBeInTheDocument()
  })

  it('keeps profile in the header and exposes Crisis in primary navigation', async () => {
    render(<AppRouter />)

    const primaryNavigation = screen.getAllByRole('navigation', { name: 'Primary navigation' })
    primaryNavigation.forEach((navigation) => {
      expect(navigation).toHaveTextContent('Home')
      expect(navigation).toHaveTextContent('Wi-Fi')
      expect(navigation).toHaveTextContent('Support')
      expect(navigation).toHaveTextContent('Crisis')
      expect(navigation).not.toHaveTextContent('Profile')
    })
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/settings')
  })

  it('opens the Crisis section from its new route', async () => {
    window.history.replaceState({}, '', '/crisis')

    render(<AppRouter />)

    expect(await screen.findByRole('heading', { name: 'Pre-crisis guidance' })).toBeVisible()
    expect(window.location.pathname).toBe('/crisis')
  })
})
