import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { storageKeys } from '../../../app/config/product'
import { searchLocations } from '../data/locationSearchApi'
import type { MapPlaceResult } from '../model/mapTypes'
import { MapPage } from './MapPage'

const mapResult: MapPlaceResult = {
  places: [
    {
      id: 'wifi:w1', sourceId: 'w1', source: 'wifi', kind: 'wifi', name: 'Library Wi-Fi',
      postcode: '3453', suburb: 'Harcourt', latitude: -36.99, longitude: 144.26,
      dataUpdatedAt: '2026-09-30T00:00:00.000Z', dataOrigin: 'network',
    },
    {
      id: 'support:s1', sourceId: 's1', source: 'support', kind: 'support', name: 'Community House',
      postcode: '3453', suburb: 'Harcourt', latitude: -36.98, longitude: 144.25,
      dataUpdatedAt: '2026-09-30T00:00:00.000Z', dataOrigin: 'network', serviceTypes: ['Homelessness support'],
    },
    {
      id: 'support:s2', sourceId: 's2', source: 'support', kind: 'support', name: 'Regional Pantry',
      postcode: '3453', suburb: 'Harcourt',
      dataUpdatedAt: '2026-09-30T00:00:00.000Z', dataOrigin: 'network', serviceTypes: ['Food relief'],
    },
  ],
  generatedAt: '2026-09-30T00:00:00.000Z',
  limitations: [],
  dataOrigin: 'network',
  datasets: [],
  sourceErrors: [],
}

vi.mock('../data/mapPlaceRepository', () => ({
  getMapPlaceRepository: () => ({ findNearby: vi.fn().mockResolvedValue(mapResult) }),
}))

vi.mock('../data/locationSearchApi', () => ({
  searchLocations: vi.fn().mockResolvedValue([]),
  resolveCoordinates: vi.fn(),
}))

vi.mock('../../../shared/map/LazyMapView', () => ({
  LazyMapView: ({ markers }: { markers: unknown[] }) => <div data-testid="map-marker-count">{markers.length}</div>,
}))

describe('unified Map page', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
    window.localStorage.setItem(storageKeys.searchLocation, JSON.stringify({ postcode: '3453', label: 'Harcourt 3453' }))
    delete mapResult.places.find((place) => place.id === 'support:s1')?.phone
  })

  it('keeps the list and map on the same filtered result set', async () => {
    render(<MemoryRouter initialEntries={['/map']}><MapPage /></MemoryRouter>)

    expect(await screen.findByText('Library Wi-Fi')).toBeVisible()
    expect(screen.getByText('Community House')).toBeVisible()
    expect(screen.getByText('Regional Pantry')).toBeVisible()
    expect(screen.getByTestId('map-marker-count')).toHaveTextContent('2')
    expect(screen.getByText('Not shown on map — coordinates not provided')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Free Wi-Fi' }))

    expect(screen.getByText('Library Wi-Fi')).toBeVisible()
    expect(screen.queryByText('Community House')).not.toBeInTheDocument()
    expect(screen.queryByText('Regional Pantry')).not.toBeInTheDocument()
    expect(screen.getByTestId('map-marker-count')).toHaveTextContent('1')
  })

  it('keeps the newly chosen charity tag instead of returning to All', async () => {
    render(<MemoryRouter initialEntries={['/map?category=wifi']}><MapPage /></MemoryRouter>)
    expect(await screen.findByText('Library Wi-Fi')).toBeVisible()
    expect(screen.queryByText('Community House')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Homelessness' }))

    expect(screen.getByText('Community House')).toBeVisible()
    expect(screen.queryByText('Library Wi-Fi')).not.toBeInTheDocument()
    expect(screen.queryByText('Regional Pantry')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Homelessness' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Food' }))

    expect(screen.getByText('Regional Pantry')).toBeVisible()
    expect(screen.queryByText('Community House')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Food' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('does not expose unconfirmed emergency filters', async () => {
    render(<MemoryRouter initialEntries={['/map']}><MapPage /></MemoryRouter>)
    await screen.findByText('Library Wi-Fi')
    expect(screen.queryByRole('button', { name: 'Hospitals' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Police' })).not.toBeInTheDocument()
  })

  it('returns to results when a restored place is no longer in the current result set', async () => {
    window.sessionStorage.setItem('shieldahead.map.session.v1', JSON.stringify({
      area: { postcode: '3453', label: 'Harcourt 3453' },
      query: 'Harcourt 3453',
      selectedKinds: ['wifi', 'support'],
      selectedPlaceId: 'wifi:removed-place',
      panelMode: 'details',
      mobileView: 'map',
      panelSize: 'half',
      listScrollTop: 0,
    }))

    render(<MemoryRouter initialEntries={['/map?area=3453&category=wifi']}><MapPage /></MemoryRouter>)

    expect(await screen.findByText('Library Wi-Fi')).toBeVisible()
    await waitFor(() => {
      expect(screen.queryByText('This place is no longer in these results')).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Places near Harcourt 3453' })).toBeVisible()
    })
    expect(screen.getByTestId('map-marker-count')).toHaveTextContent('1')
    expect(screen.getByRole('button', { name: 'Free Wi-Fi' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('Community House')).not.toBeInTheDocument()
  })

  it('opens one shared detail state and enters route planning without losing the selected place', async () => {
    render(<MemoryRouter initialEntries={['/map']}><MapPage /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: /Library Wi-Fi/ }))

    expect(screen.getByRole('heading', { name: 'Library Wi-Fi' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Directions' })).toBeVisible()
    const panelHandle = screen.getByRole('separator', { name: 'Resize information panel' })
    expect(panelHandle).toHaveAttribute('aria-valuenow', '1')
    fireEvent.keyDown(panelHandle, { key: 'ArrowUp' })
    expect(panelHandle).toHaveAttribute('aria-valuenow', '2')
    fireEvent.keyDown(panelHandle, { key: 'ArrowDown' })
    expect(panelHandle).toHaveAttribute('aria-valuenow', '1')
    expect(screen.getByTestId('map-marker-count')).toHaveTextContent('1')
    expect(screen.queryByRole('link', { name: 'Call' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Directions' }))
    expect(screen.getByRole('heading', { name: 'Plan a route' })).toBeVisible()
    expect(screen.getByDisplayValue('Library Wi-Fi')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Walking' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows inferred support types with their limitation and exposes Call only when supplied', async () => {
    const supportWithPhone = mapResult.places.find((place) => place.id === 'support:s1')
    if (supportWithPhone) supportWithPhone.phone = '03 5555 0100'
    render(<MemoryRouter initialEntries={['/map']}><MapPage /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: /Community House/ }))

    expect(screen.getByText('Homelessness support')).toBeVisible()
    expect(screen.getByText(/inferred from published charity information/)).toBeVisible()
    expect(screen.getByRole('link', { name: 'Call' })).toHaveAttribute('href', 'tel:03 5555 0100')
  })

  it('requires a saved postcode instead of attempting a suburb lookup while offline', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false })
    render(<MemoryRouter initialEntries={['/map']}><MapPage /></MemoryRouter>)
    const input = screen.getByRole('combobox', { name: 'Search area' })

    fireEvent.change(input, { target: { value: 'Ballarat' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Suburb search needs an internet connection')
  })

  it('suggests places while typing and loads the area only after one is chosen', async () => {
    vi.mocked(searchLocations).mockResolvedValue([
      { postcode: '3350', label: 'Ballarat 3350' },
      { postcode: '3352', label: 'Ballarat East 3352' },
    ])
    render(<MemoryRouter initialEntries={['/map']}><MapPage /></MemoryRouter>)
    expect(await screen.findByText('Library Wi-Fi')).toBeVisible()

    fireEvent.change(screen.getByRole('combobox', { name: 'Search area' }), { target: { value: 'Ballarat' } })

    expect(await screen.findByRole('option', { name: /Ballarat 3350/ })).toBeVisible()
    expect(screen.getByRole('option', { name: /Ballarat East 3352/ })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Places near Harcourt 3453' })).toBeVisible()

    fireEvent.click(screen.getByRole('option', { name: /Ballarat 3350/ }))

    expect(screen.getByRole('heading', { name: 'Places near Ballarat 3350' })).toBeVisible()
    expect(screen.queryByRole('option', { name: /Ballarat East 3352/ })).not.toBeInTheDocument()
  })
})
