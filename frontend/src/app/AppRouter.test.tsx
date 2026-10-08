import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { refreshNearbySnapshot } from '../data/offline/nearbySnapshot'
import { lookupLocalities } from '../data/offline/offlineDataLoader'
import { storageKeys } from './config/product'
import { AppRouter } from './AppRouter'

vi.mock('../data/offline/offlineDataLoader', async (importActual) => ({
  ...(await importActual<typeof import('../data/offline/offlineDataLoader')>()),
  lookupLocalities: vi.fn().mockResolvedValue(null),
}))

vi.mock('../data/preloadNearbyData', () => ({ preloadNearbyData: vi.fn() }))

vi.mock('../data/offline/nearbySnapshot', async (importActual) => ({
  ...(await importActual<typeof import('../data/offline/nearbySnapshot')>()),
  refreshNearbySnapshot: vi.fn().mockResolvedValue('saved'),
}))

describe('first-run routing', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/')
    vi.mocked(refreshNearbySnapshot).mockClear()
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

  it('opens saved nearby services at /nearby without fetching anything from the app shell', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    window.localStorage.setItem(storageKeys.myArea, JSON.stringify({ postcode: '3453', label: '3453', savedAt: '' }))
    window.history.replaceState({}, '', '/nearby')
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false })

    try {
      render(<AppRouter />)
      expect(await screen.findByRole('heading', { level: 1, name: 'Saved nearby services' })).toBeVisible()
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
      fetchSpy.mockRestore()
    }
  })

  it('asks which suburb during setup and shows it on the review page and in My area', async () => {
    vi.mocked(lookupLocalities).mockResolvedValue([
      { id: 'loc-harcourt', name: 'Harcourt', postcodes: ['3453'], lat: -36.9934, lng: 144.2583 },
      { id: 'loc-harcourt-north', name: 'Harcourt North', postcodes: ['3453'], lat: -36.9511, lng: 144.2763 },
    ])
    window.history.replaceState({}, '', '/setup/needs')
    render(<AppRouter />)

    fireEvent.change(await screen.findByLabelText(/My area \(postcode\)/), { target: { value: '3453' } })
    fireEvent.click(screen.getByRole('button', { name: 'Review details' }))
    fireEvent.click(await screen.findByRole('radio', { name: 'Harcourt' }))
    fireEvent.click(screen.getByRole('button', { name: 'Review details' }))

    expect(await screen.findByRole('heading', { name: 'Review your details' })).toBeVisible()
    expect(screen.getByText('My area').nextSibling).toHaveTextContent('Harcourt 3453')
    fireEvent.click(screen.getByRole('link', { name: 'Continue to choices' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Save choices and continue' }))

    await waitFor(() => expect(window.location.pathname).toBe('/setup/complete'))
    expect(refreshNearbySnapshot).toHaveBeenCalledTimes(1)
    expect(JSON.parse(window.localStorage.getItem(storageKeys.myArea)!)).toMatchObject({
      postcode: '3453', localityId: 'loc-harcourt', localityName: 'Harcourt', label: 'Harcourt 3453',
    })
  })

  it('opens the Crisis section from its new route', async () => {
    window.history.replaceState({}, '', '/crisis')

    render(<AppRouter />)

    expect(await screen.findByRole('heading', { name: 'Pre-crisis guidance' })).toBeVisible()
    expect(window.location.pathname).toBe('/crisis')
  })
})
