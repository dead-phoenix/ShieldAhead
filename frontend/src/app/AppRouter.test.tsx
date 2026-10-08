import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { storageKeys } from './config/product'
import { AppRouter } from './AppRouter'

describe('first-run routing', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/')
  })

  it('shows the home page to a new visitor, with a household setup link and no account wording', async () => {
    render(<AppRouter />)

    expect(await screen.findByRole('heading', { name: /Shield Ahead.*Before it happens/i })).toBeVisible()
    expect(window.location.pathname).toBe('/')
    expect(screen.getByRole('link', { name: 'Set up my household' })).toHaveAttribute('href', '/setup')
    expect(screen.queryByText(/log in|sign up/i)).not.toBeInTheDocument()
  })

  it('redirects the old household basics step to the needs step', async () => {
    window.history.replaceState({}, '', '/setup/household')

    render(<AppRouter />)

    expect(await screen.findByRole('heading', { name: 'About your household' })).toBeVisible()
    expect(window.location.pathname).toBe('/setup/needs')
    expect(screen.getByLabelText(/My area \(postcode\)/)).toBeRequired()
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^Age/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Household size/)).not.toBeInTheDocument()
  })

  it('opens the map on My area when no search has been made', async () => {
    window.localStorage.setItem(storageKeys.myArea, JSON.stringify({
      postcode: '3453',
      label: '3453',
      savedAt: '2026-10-01T00:00:00.000Z',
    }))
    window.history.replaceState({}, '', '/support')

    render(<AppRouter />)

    expect(await screen.findByRole('heading', { name: 'Support' })).toBeVisible()
    expect(window.location.pathname).toBe('/map')
  })

  it('asks for a search area before opening support', async () => {
    window.history.replaceState({}, '', '/support')

    render(<AppRouter />)

    expect(await screen.findByRole('heading', { name: 'Find places near you' })).toBeVisible()
    expect(window.location.pathname).toBe('/location')
  })

  it('redirects the old support entry to the unified Map', async () => {
    window.localStorage.setItem(storageKeys.searchLocation, JSON.stringify({
      postcode: '3453',
      label: 'Harcourt 3453',
    }))
    window.history.replaceState({}, '', '/support')

    render(<AppRouter />)

    expect(await screen.findByRole('heading', { name: 'Support' })).toBeVisible()
    expect(window.location.pathname).toBe('/map')
    expect(window.location.search).toBe('?category=support')
  })

  it('shows home to a returning user with a saved profile and consent', async () => {
    window.localStorage.setItem(storageKeys.householdProfile, JSON.stringify({ name: 'Mel', age: 40, postcode: '3453' }))
    window.localStorage.setItem(storageKeys.consent, JSON.stringify({
      profileStorageAccepted: true,
      optionalCategories: {},
      updatedAt: '2026-09-04T00:00:00.000Z',
    }))

    render(<AppRouter />)

    expect(await screen.findByRole('heading', { name: /Shield Ahead.*Before it happens/i })).toBeVisible()
    expect(window.location.pathname).toBe('/')
    expect(screen.queryByRole('link', { name: 'Set up my household' })).not.toBeInTheDocument()
    expect(JSON.parse(window.localStorage.getItem(storageKeys.householdProfile)!)).toEqual({})
    expect(JSON.parse(window.localStorage.getItem(storageKeys.myArea)!)).toMatchObject({ postcode: '3453' })
  })

  it('keeps profile in the header and exposes Crisis in primary navigation', async () => {
    render(<AppRouter />)

    const primaryNavigation = screen.getAllByRole('navigation', { name: 'Primary navigation' })
    primaryNavigation.forEach((navigation) => {
      expect(navigation).toHaveTextContent('Home')
      expect(navigation).toHaveTextContent('Support')
      expect(navigation).toHaveTextContent('Crisis')
      expect(navigation).toHaveTextContent('Crisis pack')
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
