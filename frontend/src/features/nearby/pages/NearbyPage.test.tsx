import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { storageKeys } from '../../../app/config/product'
import { buildNearbySnapshot, refreshNearbySnapshot } from '../../../data/offline/nearbySnapshot'
import type { MyArea } from '../../../data/contracts'
import { HARCOURT_POINT, SYDNEY_POINT, fixtureBundle } from '../../../test/nearbyFixtures'
import { NearbyPage } from './NearbyPage'

vi.mock('../../../data/offline/nearbySnapshot', async (importActual) => ({
  ...(await importActual<typeof import('../../../data/offline/nearbySnapshot')>()),
  refreshNearbySnapshot: vi.fn(),
}))

const OUT_OF_REGION = 'Saved nearby services cover the Loddon Campaspe region only. In an emergency call 000.'
const harcourt: MyArea = { postcode: '3453', localityId: 'loc-harcourt', localityName: 'Harcourt', label: 'Harcourt 3453', savedAt: '' }
const melbourne: MyArea = { postcode: '3000', label: '3000', savedAt: '' }

function setArea(area: MyArea) {
  window.localStorage.setItem(storageKeys.myArea, JSON.stringify(area))
}

function saveSnapshotFor(area: MyArea) {
  window.localStorage.setItem(storageKeys.nearbySnapshot, JSON.stringify(buildNearbySnapshot(area, fixtureBundle(), '2026-10-08T06:00:00.000Z')))
}

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value })
}

type Outcome = { point: { lat: number; lng: number } } | { errorCode: 1 | 2 | 3 }

function mockGeolocation(outcome: Outcome) {
  const getCurrentPosition = vi.fn((success: PositionCallback, failure?: PositionErrorCallback | null) => {
    if ('point' in outcome) {
      success({ coords: { latitude: outcome.point.lat, longitude: outcome.point.lng, accuracy: 20 } } as GeolocationPosition)
    } else {
      failure?.({ code: outcome.errorCode, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: '' } as GeolocationPositionError)
    }
  })
  Object.defineProperty(window.navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } })
  return getCurrentPosition
}

function renderPage(initialEntries: string[] = ['/nearby']) {
  return render(<MemoryRouter initialEntries={initialEntries}><NearbyPage /></MemoryRouter>)
}

function clickUseMyLocation() {
  fireEvent.click(screen.getByRole('button', { name: 'Use my current location' }))
}

describe('Saved nearby services page', () => {
  beforeEach(() => {
    vi.mocked(refreshNearbySnapshot).mockReset().mockRejectedValue(new Error('data could not be loaded'))
    setOnline(true)
  })

  afterEach(() => setOnline(true))

  it('lists the saved services for My area, with the emergency number, without refetching', () => {
    setArea(harcourt)
    saveSnapshotFor(harcourt)
    renderPage()

    expect(screen.getByRole('heading', { level: 1, name: 'Saved nearby services' })).toBeVisible()
    expect(screen.getByText('In an emergency call 000.')).toBeVisible()
    const list = screen.getByRole('region', { name: 'Near Harcourt 3453' })
    expect(within(list).getByText('Harcourt Fire Station')).toBeVisible()
    expect(within(list).getByText('Bendigo Food Share').parentElement).toHaveTextContent('Approximate location')
    expect(screen.getByText(/^Saved on 8 October 2026\./)).toBeVisible()
    expect(refreshNearbySnapshot).not.toHaveBeenCalled()
  })

  it('shows every category section when there is no category in the URL', () => {
    setArea(harcourt)
    saveSnapshotFor(harcourt)
    renderPage()

    const list = screen.getByRole('region', { name: 'Near Harcourt 3453' })
    expect(within(list).getByRole('heading', { name: 'Hospitals' })).toBeVisible()
    expect(within(list).getByRole('heading', { name: 'Police stations' })).toBeVisible()
    expect(within(list).getByRole('heading', { name: 'Free Wi-Fi' })).toBeVisible()
    expect(within(list).getByRole('heading', { name: 'Charities' })).toBeVisible()
  })

  it('shows only the matching category when the search sent a specific kind', () => {
    setArea(harcourt)
    saveSnapshotFor(harcourt)
    renderPage(['/nearby?category=hospital'])

    const list = screen.getByRole('region', { name: 'Near Harcourt 3453' })
    expect(within(list).getByRole('heading', { name: 'Hospitals' })).toBeVisible()
    expect(within(list).queryByRole('heading', { name: 'Police stations' })).not.toBeInTheDocument()
    expect(within(list).queryByRole('heading', { name: 'Free Wi-Fi' })).not.toBeInTheDocument()
  })

  it('maps the Map\'s "support" category name to charities, the offline data\'s own name for it', () => {
    setArea(harcourt)
    saveSnapshotFor(harcourt)
    renderPage(['/nearby?category=support'])

    const list = screen.getByRole('region', { name: 'Near Harcourt 3453' })
    expect(within(list).getByRole('heading', { name: 'Charities' })).toBeVisible()
    expect(within(list).queryByRole('heading', { name: 'Hospitals' })).not.toBeInTheDocument()
  })

  it('warns when the saved list is for a different area than My area', () => {
    saveSnapshotFor(harcourt)
    setArea({ postcode: '3550', localityId: 'loc-bendigo', localityName: 'Bendigo', label: 'Bendigo 3550', savedAt: '' })
    renderPage()

    expect(screen.getByRole('alert')).toHaveTextContent(
      'This list is for Harcourt 3453, not Bendigo 3550. Update saved information when you are online.',
    )
    expect(screen.getByRole('region', { name: 'Saved list for Harcourt 3453' })).toBeVisible()
    expect(screen.queryByRole('region', { name: /Near Bendigo/ })).not.toBeInTheDocument()
    expect(refreshNearbySnapshot).toHaveBeenCalledTimes(1)
  })

  it('shows no live list when GPS is outside the region, and keeps the saved list below', () => {
    setArea(harcourt)
    saveSnapshotFor(harcourt)
    mockGeolocation({ point: SYDNEY_POINT })
    renderPage()
    clickUseMyLocation()

    const message = screen.getByText(OUT_OF_REGION)
    expect(message).toBeVisible()
    expect(screen.queryByRole('region', { name: 'Near your current location' })).not.toBeInTheDocument()
    const savedList = screen.getByRole('region', { name: 'Near Harcourt 3453' })
    expect(message.compareDocumentPosition(savedList) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows the live list with the region message above it when My area is outside the region but GPS is inside', () => {
    setArea(melbourne)
    saveSnapshotFor(melbourne)
    mockGeolocation({ point: HARCOURT_POINT })
    renderPage()
    expect(screen.getByText(OUT_OF_REGION)).toBeVisible()
    expect(screen.queryByRole('region', { name: /^Near 3000/ })).not.toBeInTheDocument()

    clickUseMyLocation()

    const messages = screen.getAllByText(OUT_OF_REGION)
    expect(messages).toHaveLength(1)
    const liveList = screen.getByRole('region', { name: 'Near your current location' })
    expect(within(liveList).getAllByRole('listitem')[0]).toHaveTextContent('Bendigo Hospital')
    expect(messages[0].compareDocumentPosition(liveList) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it.each([
    [1, 'Location access is blocked. You can still use the saved list below.'],
    [3, 'Your location could not be found in time. Try again, or use the saved list below.'],
    [2, 'Your location could not be found. Try again, or use the saved list below.'],
  ] as const)('explains GPS error %i and keeps the saved list', (errorCode, message) => {
    setArea(harcourt)
    saveSnapshotFor(harcourt)
    mockGeolocation({ errorCode })
    renderPage()
    clickUseMyLocation()

    expect(screen.getByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('region', { name: 'Near Harcourt 3453' })).toBeVisible()
  })

  it('explains when nothing is saved yet and the device is offline', () => {
    setOnline(false)
    setArea(harcourt)
    mockGeolocation({ point: HARCOURT_POINT })
    renderPage()

    expect(screen.getByRole('status')).toHaveTextContent('Nearby services have not been saved on this device yet.')
    clickUseMyLocation()
    expect(screen.getByRole('alert')).toHaveTextContent('Nearby services are not saved on this device yet')
    expect(refreshNearbySnapshot).not.toHaveBeenCalled()
  })

  it('asks a new user to set My area', () => {
    renderPage()
    expect(screen.getByRole('link', { name: 'Set My area' })).toHaveAttribute('href', '/settings/my-area')
  })
})
