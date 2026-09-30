import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDirections } from '../../data/api/directionsApi'
import { DirectionsPanel } from './DirectionsPanel'

vi.mock('../../data/api/directionsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/api/directionsApi')>()
  return { ...actual, getDirections: vi.fn() }
})

const getDirectionsMock = vi.mocked(getDirections)
const destination = { name: 'Community House', latitude: -36.75, longitude: 144.28 }

describe('Directions panel', () => {
  beforeEach(() => {
    getDirectionsMock.mockReset()
    getDirectionsMock.mockResolvedValue({
      distanceMeters: 1500,
      durationSeconds: 900,
      coordinates: [[144.27, -36.76], [144.28, -36.75]],
      disclaimer: 'Standard route only. Check official advice.',
    })
  })

  it('keeps the destination visible and explains that route calculation is unavailable offline', () => {
    render(<DirectionsPanel destination={destination} isOnline={false} onRouteChange={vi.fn()} onRequestMapStart={vi.fn()} />)

    expect(screen.getByDisplayValue('Community House')).toBeVisible()
    expect(screen.getByText(/calculating or updating a route requires an internet connection/)).toBeVisible()
    expect(screen.getByRole('button', { name: /Choose on map/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Use my location/ })).toBeDisabled()
  })

  it('calculates from a selected map point and recalculates when travel mode changes', async () => {
    const onRouteChange = vi.fn()
    const { rerender } = render(
      <DirectionsPanel destination={destination} onRouteChange={onRouteChange} onRequestMapStart={vi.fn()} />,
    )
    const start = { latitude: -36.76, longitude: 144.27 }
    rerender(
      <DirectionsPanel destination={destination} selectedMapStart={start} onRouteChange={onRouteChange} onRequestMapStart={vi.fn()} />,
    )

    expect(await screen.findByText('15 min')).toBeVisible()
    expect(screen.getByText('1.5 km')).toBeVisible()
    expect(getDirectionsMock).toHaveBeenCalledWith(start, destination, 'foot-walking')

    fireEvent.click(screen.getByRole('button', { name: 'Driving' }))
    await waitFor(() => expect(getDirectionsMock).toHaveBeenLastCalledWith(start, destination, 'driving-car'))
  })

  it('offers an in-place retry after a routing error', async () => {
    getDirectionsMock.mockRejectedValueOnce(new Error('Routing is temporarily unavailable'))
    const start = { latitude: -36.76, longitude: 144.27 }
    const { rerender } = render(
      <DirectionsPanel destination={destination} onRouteChange={vi.fn()} onRequestMapStart={vi.fn()} />,
    )
    rerender(
      <DirectionsPanel destination={destination} selectedMapStart={start} onRouteChange={vi.fn()} onRequestMapStart={vi.fn()} />,
    )

    expect(await screen.findByText('Routing is temporarily unavailable')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('15 min')).toBeVisible()
  })
})
