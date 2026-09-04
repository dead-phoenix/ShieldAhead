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

    expect(await screen.findByRole('heading', { name: 'About ShieldAhead' })).toBeVisible()
    expect(window.location.pathname).toBe('/')
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/setup')
    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/setup')
  })

  it('asks an unsigned visitor to log in instead of opening support', async () => {
    window.history.replaceState({}, '', '/support')

    render(<AppRouter />)

    expect(await screen.findByRole('heading', { name: 'Log in to continue' })).toBeVisible()
    expect(window.location.pathname).toBe('/support')
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/setup')
  })

  it('shows home to a returning user with a saved profile and consent', async () => {
    window.localStorage.setItem(storageKeys.householdProfile, JSON.stringify({ postcode: '3453' }))
    window.localStorage.setItem(storageKeys.consent, JSON.stringify({
      profileStorageAccepted: true,
      optionalCategories: {},
      updatedAt: '2026-09-04T00:00:00.000Z',
    }))

    render(<AppRouter />)

    expect(await screen.findByRole('heading', { name: 'About ShieldAhead' })).toBeVisible()
    expect(window.location.pathname).toBe('/')
    expect(screen.queryByRole('link', { name: 'Sign up' })).not.toBeInTheDocument()
  })
})
