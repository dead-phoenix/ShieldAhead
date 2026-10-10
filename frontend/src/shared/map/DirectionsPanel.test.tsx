import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDirections } from '../../data/api/directionsApi'
import { readOfflineRoute, saveOfflineRoute } from '../../features/map/data/offlineRouteStorage'
import { DirectionsPanel } from './DirectionsPanel'

vi.mock('../../data/api/directionsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/api/directionsApi')>()
  return { ...actual, getDirections: vi.fn() }
})

const getDirectionsMock = vi.mocked(getDirections)
const destination = { name: 'Community House', latitude: -36.75, longitude: 144.28 }

const ROUTE_WITH_STEPS = {
  routes: [{
    distanceMeters: 1500,
    durationSeconds: 900,
    coordinates: [[144.27, -36.76], [144.275, -36.755], [144.28, -36.75]] as [number, number][],
    steps: [
      { distanceMeters: 750, durationSeconds: 450, maneuverType: 11, instruction: 'Head north', startCoordinateIndex: 0 },
      { distanceMeters: 750, durationSeconds: 450, maneuverType: 1, instruction: 'Turn right onto Example Street', streetName: 'Example Street', startCoordinateIndex: 1 },
    ],
  }],
  disclaimer: 'Standard route only. Check official advice.',
}

interface FakePositionCallback {
  (position: { coords: { latitude: number; longitude: number; heading: number | null; accuracy: number } }): void
}

function stubGeolocation() {
  const watchCallbacks: FakePositionCallback[] = []
  const watchPosition = vi.fn((success: FakePositionCallback) => {
    watchCallbacks.push(success)
    return watchCallbacks.length
  })
  const clearWatch = vi.fn()
  Object.defineProperty(globalThis.navigator, 'geolocation', {
    configurable: true,
    value: { watchPosition, clearWatch, getCurrentPosition: vi.fn() },
  })
  return {
    // Wrapped in act() so each fix gets its own render + effect cycle —
    // calling the raw callback three times in a row without this would
    // let React 18 batch them into a single render, collapsing what
    // should be three separate off-route readings into one.
    emit: (latitude: number, longitude: number) => {
      act(() => {
        watchCallbacks.forEach((callback) => callback({ coords: { latitude, longitude, heading: null, accuracy: 5 } }))
      })
    },
    clearWatch,
  }
}

describe('Directions panel', () => {
  beforeEach(() => {
    getDirectionsMock.mockReset()
    getDirectionsMock.mockResolvedValue({
      routes: [{
        distanceMeters: 1500,
        durationSeconds: 900,
        coordinates: [[144.27, -36.76], [144.28, -36.75]],
        steps: [],
      }],
      disclaimer: 'Standard route only. Check official advice.',
    })
    window.localStorage.clear()
  })

  describe('offline route recovery', () => {
    it('only saves a route for offline use when the person taps the save button', async () => {
      const start = { latitude: -36.76, longitude: 144.27 }
      const { rerender } = render(
        <DirectionsPanel destination={destination} destinationId="dest-1" onRouteChange={vi.fn()} onRequestMapStart={vi.fn()} />,
      )
      rerender(
        <DirectionsPanel destination={destination} destinationId="dest-1" selectedMapStart={start} onRouteChange={vi.fn()} onRequestMapStart={vi.fn()} />,
      )

      await screen.findByText('15 min')
      expect(readOfflineRoute('dest-1')).toBeUndefined()

      fireEvent.click(screen.getByRole('button', { name: /Save for offline use/ }))

      const saved = readOfflineRoute('dest-1')
      expect(saved?.destinationName).toBe('Community House')
      expect(saved?.route.distanceMeters).toBe(1500)
      expect(screen.getByRole('button', { name: /Saved for offline use/ })).toBeVisible()
    })

    it('does not offer to save a route that starts at the current location', async () => {
      Object.defineProperty(globalThis.navigator, 'geolocation', {
        configurable: true,
        value: {
          watchPosition: vi.fn(),
          clearWatch: vi.fn(),
          getCurrentPosition: vi.fn((success: PositionCallback) => success({
            coords: { latitude: -36.76, longitude: 144.27, accuracy: 5 },
          } as GeolocationPosition)),
        },
      })
      render(
        <DirectionsPanel destination={destination} destinationId="dest-1" onRouteChange={vi.fn()} onRequestMapStart={vi.fn()} />,
      )

      fireEvent.click(screen.getByRole('button', { name: /Use my location/ }))

      expect(await screen.findByText('15 min')).toBeVisible()
      expect(screen.getByText('Routes that start at your current location are not saved.')).toBeVisible()
      expect(screen.queryByRole('button', { name: /Save for offline use/ })).not.toBeInTheDocument()
      expect(readOfflineRoute('dest-1')).toBeUndefined()
    })

    it('shows a previously saved route with no network call when offline and nothing else is restored', async () => {
      saveOfflineRoute({
        destinationId: 'dest-1',
        destinationName: 'Community House',
        destinationLatitude: destination.latitude,
        destinationLongitude: destination.longitude,
        profile: 'foot-walking',
        origin: { latitude: -36.76, longitude: 144.27 },
        originLabel: 'Selected map point',
        route: {
          distanceMeters: 1500,
          durationSeconds: 900,
          coordinates: [[144.27, -36.76], [144.28, -36.75]],
          steps: [],
          disclaimer: 'Standard route only.',
        },
      })

      render(
        <DirectionsPanel destination={destination} destinationId="dest-1" isOnline={false} onRouteChange={vi.fn()} onRequestMapStart={vi.fn()} />,
      )

      expect(await screen.findByText('15 min')).toBeVisible()
      expect(screen.getByText(/saved for offline use/)).toBeVisible()
      expect(getDirectionsMock).not.toHaveBeenCalled()
    })

    it('does not show a saved route for a different destination', () => {
      saveOfflineRoute({
        destinationId: 'some-other-place',
        destinationName: 'Somewhere Else',
        destinationLatitude: 1,
        destinationLongitude: 1,
        profile: 'foot-walking',
        origin: { latitude: 1, longitude: 1 },
        originLabel: 'Somewhere',
        route: { distanceMeters: 1500, durationSeconds: 900, coordinates: [[1, 1], [2, 2]], steps: [], disclaimer: '' },
      })

      render(
        <DirectionsPanel destination={destination} destinationId="dest-1" isOnline={false} onRouteChange={vi.fn()} onRequestMapStart={vi.fn()} />,
      )

      expect(screen.queryByText('15 min')).not.toBeInTheDocument()
    })

    it('tells the user rerouting needs a connection instead of silently failing, when off-route offline', async () => {
      getDirectionsMock.mockResolvedValue({
        routes: [{
          distanceMeters: 1500,
          durationSeconds: 900,
          coordinates: [[144.27, -36.76], [144.275, -36.755], [144.28, -36.75]],
          steps: [
            { distanceMeters: 750, durationSeconds: 450, maneuverType: 11, instruction: 'Head north', startCoordinateIndex: 0 },
            { distanceMeters: 750, durationSeconds: 450, maneuverType: 1, instruction: 'Turn right', startCoordinateIndex: 1 },
          ],
        }],
        disclaimer: 'Standard route only.',
      })
      const watchCallbacks: ((position: { coords: { latitude: number; longitude: number; heading: number | null; accuracy: number } }) => void)[] = []
      Object.defineProperty(globalThis.navigator, 'geolocation', {
        configurable: true,
        value: {
          watchPosition: vi.fn((success: typeof watchCallbacks[0]) => { watchCallbacks.push(success); return 1 }),
          clearWatch: vi.fn(),
          getCurrentPosition: vi.fn(),
        },
      })
      const start = { latitude: -36.76, longitude: 144.27 }
      const { rerender } = render(
        <DirectionsPanel destination={destination} destinationId="dest-1" onRouteChange={vi.fn()} onRequestMapStart={vi.fn()} />,
      )
      rerender(
        <DirectionsPanel destination={destination} destinationId="dest-1" selectedMapStart={start} isOnline onRouteChange={vi.fn()} onRequestMapStart={vi.fn()} />,
      )
      expect(await screen.findByText('15 min')).toBeVisible()
      fireEvent.click(screen.getByRole('button', { name: 'Start navigation' }))
      await screen.findByText('Finding your location…')

      // Go offline mid-navigation, then drift off-route for 3 consecutive fixes.
      rerender(
        <DirectionsPanel destination={destination} destinationId="dest-1" selectedMapStart={start} isOnline={false} onRouteChange={vi.fn()} onRequestMapStart={vi.fn()} />,
      )
      getDirectionsMock.mockClear()
      const offRoutePoint = { latitude: -36.90, longitude: 144.27 }
      act(() => {
        watchCallbacks.forEach((callback) => callback({ coords: { latitude: offRoutePoint.latitude, longitude: offRoutePoint.longitude, heading: null, accuracy: 5 } }))
      })
      act(() => {
        watchCallbacks.forEach((callback) => callback({ coords: { latitude: offRoutePoint.latitude, longitude: offRoutePoint.longitude, heading: null, accuracy: 5 } }))
      })
      act(() => {
        watchCallbacks.forEach((callback) => callback({ coords: { latitude: offRoutePoint.latitude, longitude: offRoutePoint.longitude, heading: null, accuracy: 5 } }))
      })

      expect(await screen.findByText(/rerouting needs an internet connection/)).toBeVisible()
      expect(getDirectionsMock).not.toHaveBeenCalled()
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
    expect(getDirectionsMock).toHaveBeenCalledWith(start, destination, 'foot-walking', undefined)

    fireEvent.click(screen.getByRole('button', { name: 'Driving' }))
    await waitFor(() => expect(getDirectionsMock).toHaveBeenLastCalledWith(start, destination, 'driving-car', undefined))
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

  it('passes viaKind through to getDirections and labels a via-route distinctly', async () => {
    getDirectionsMock.mockResolvedValue({
      routes: [
        { distanceMeters: 1500, durationSeconds: 900, coordinates: [[144.27, -36.76], [144.28, -36.75]], steps: [] },
        {
          distanceMeters: 1800, durationSeconds: 1000,
          coordinates: [[144.27, -36.76], [144.28, -36.75]], steps: [],
          viaPlace: { name: 'Kilmore District Hospital', kind: 'hospital' },
        },
      ],
      disclaimer: 'Standard route only. Check official advice.',
    })
    const start = { latitude: -36.76, longitude: 144.27 }
    const { rerender } = render(
      <DirectionsPanel destination={destination} onRouteChange={vi.fn()} onRequestMapStart={vi.fn()} viaKind="hospital" />,
    )
    rerender(
      <DirectionsPanel destination={destination} selectedMapStart={start} onRouteChange={vi.fn()} onRequestMapStart={vi.fn()} viaKind="hospital" />,
    )

    expect(await screen.findByText('Via Kilmore District Hospital')).toBeVisible()
    expect(getDirectionsMock).toHaveBeenCalledWith(start, destination, 'foot-walking', 'hospital')
    expect(screen.queryByText(/Route 2/)).not.toBeInTheDocument()
  })

  describe('Start navigation', () => {
    it('shows live turn-by-turn progress as GPS fixes arrive, and reports the position to the parent', async () => {
      getDirectionsMock.mockResolvedValue(ROUTE_WITH_STEPS)
      const geolocation = stubGeolocation()
      const onLivePositionChange = vi.fn()
      const start = { latitude: -36.76, longitude: 144.27 }
      const { rerender } = render(
        <DirectionsPanel destination={destination} onRouteChange={vi.fn()} onRequestMapStart={vi.fn()} onLivePositionChange={onLivePositionChange} />,
      )
      rerender(
        <DirectionsPanel destination={destination} selectedMapStart={start} onRouteChange={vi.fn()} onRequestMapStart={vi.fn()} onLivePositionChange={onLivePositionChange} />,
      )
      expect(await screen.findByText('15 min')).toBeVisible()

      fireEvent.click(screen.getByRole('button', { name: 'Start navigation' }))
      expect(await screen.findByText('Finding your location…')).toBeVisible()

      // A fix right at the route start — still on the first ("Head north") leg.
      geolocation.emit(-36.76, 144.27)
      expect(await screen.findByText('Turn right onto Example Street')).toBeVisible()
      expect(onLivePositionChange).toHaveBeenCalledWith({ latitude: -36.76, longitude: 144.27, heading: undefined })

      // A fix at the route's final coordinate — arrived.
      geolocation.emit(-36.75, 144.28)
      expect(await screen.findByText(/You have arrived at Community House/)).toBeVisible()

      fireEvent.click(screen.getByRole('button', { name: 'End navigation' }))
      expect(geolocation.clearWatch).toHaveBeenCalled()
      expect(onLivePositionChange).toHaveBeenLastCalledWith(undefined)
      expect(await screen.findByRole('button', { name: 'Start navigation' })).toBeVisible()
    })

    it('recalculates the route after several consecutive off-route fixes', async () => {
      getDirectionsMock.mockResolvedValue(ROUTE_WITH_STEPS)
      const geolocation = stubGeolocation()
      const start = { latitude: -36.76, longitude: 144.27 }
      const { rerender } = render(
        <DirectionsPanel destination={destination} onRouteChange={vi.fn()} onRequestMapStart={vi.fn()} />,
      )
      rerender(
        <DirectionsPanel destination={destination} selectedMapStart={start} onRouteChange={vi.fn()} onRequestMapStart={vi.fn()} />,
      )
      expect(await screen.findByText('15 min')).toBeVisible()
      fireEvent.click(screen.getByRole('button', { name: 'Start navigation' }))
      await screen.findByText('Finding your location…')

      getDirectionsMock.mockClear()
      // Far from the route line (the route runs along roughly -36.76,144.27 -> -36.75,144.28).
      const offRoutePoint = { latitude: -36.90, longitude: 144.27 }
      geolocation.emit(offRoutePoint.latitude, offRoutePoint.longitude)
      geolocation.emit(offRoutePoint.latitude, offRoutePoint.longitude)
      geolocation.emit(offRoutePoint.latitude, offRoutePoint.longitude)

      await waitFor(() => expect(getDirectionsMock).toHaveBeenCalledWith(offRoutePoint, destination, 'foot-walking', undefined))
    })
  })
})
