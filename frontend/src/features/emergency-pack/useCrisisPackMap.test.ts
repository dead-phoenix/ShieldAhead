import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultMapStyleUrl } from '../../shared/map/mapStyleUrl'
import { crisisPackPlacesKey, type CrisisPackMapPoint } from './crisisPackMapPoints'
import type { CrisisPackMapSnapshot } from './crisisPackMapStorage'
import type { RenderedCrisisPackMap } from './renderCrisisPackMap'
import { useCrisisPackMap, waitForStreetMapDecode } from './useCrisisPackMap'

const mocks = vi.hoisted(() => ({
  render: vi.fn(),
  read: vi.fn(),
  save: vi.fn(),
}))

vi.mock('./renderCrisisPackMap', () => ({ renderCrisisPackMap: mocks.render }))
vi.mock('./crisisPackMapStorage', () => ({
  readCrisisPackMapSnapshot: mocks.read,
  saveCrisisPackMapSnapshot: mocks.save,
}))

const pointsA: CrisisPackMapPoint[] = [{ id: 'w1', kind: 'wifi', label: 'W1', latitude: -37, longitude: 144.25 }]
const pointsB: CrisisPackMapPoint[] = [{ id: 'c1', kind: 'charity', label: 'C1', latitude: -37.01, longitude: 144.26 }]
const keyA = crisisPackPlacesKey(pointsA, defaultMapStyleUrl)
const keyB = crisisPackPlacesKey(pointsB, defaultMapStyleUrl)

function rendered(points: CrisisPackMapPoint[]): RenderedCrisisPackMap {
  return {
    image: new Blob(['png'], { type: 'image/png' }),
    width: 1014,
    height: 634,
    pixelRatio: 2,
    positions: points.map((point) => ({ key: `${point.kind}:${point.id}`, x: 507, y: 317 })),
    metersPerPixel: 3.8,
    zoom: 14,
    centerLatitude: -37,
    attribution: '© OpenFreeMap © OpenMapTiles © OpenStreetMap contributors',
  }
}

function stored(placesKey: string): CrisisPackMapSnapshot {
  return {
    placesKey,
    styleUrl: defaultMapStyleUrl,
    createdAt: '2026-10-01T00:00:00.000Z',
    attribution: 'stored attribution',
    width: 1014,
    height: 634,
    pixelRatio: 2,
    imageType: 'image/png',
    imageBytes: new Uint8Array([1, 2, 3]).buffer,
    positions: [{ key: 'wifi:w1', x: 10, y: 20 }],
    metersPerPixel: 2,
    zoom: 14,
    centerLatitude: -37,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Like the real renderer, settles only when cancelled. */
function pendingUntilAborted(_points: CrisisPackMapPoint[], { signal }: { signal: AbortSignal }) {
  return new Promise<never>((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
  })
}

let urlCount = 0

describe('useCrisisPackMap', () => {
  beforeEach(() => {
    urlCount = 0
    mocks.render.mockReset()
    mocks.read.mockReset().mockResolvedValue(null)
    mocks.save.mockReset().mockResolvedValue(undefined)
    URL.createObjectURL = vi.fn(() => `blob:street-${++urlCount}`)
    URL.revokeObjectURL = vi.fn()
  })

  it('makes a street map once the pack is refreshed online, stores it, and returns it for these places only', async () => {
    const render = deferred<RenderedCrisisPackMap>()
    mocks.render.mockReturnValue(render.promise)
    const { result } = renderHook(() => useCrisisPackMap(pointsA, { isOnline: true, canRender: true }))

    await waitFor(() => expect(result.current.status).toBe('rendering'))
    expect(result.current.streetMap).toBeUndefined()
    expect(mocks.render).toHaveBeenCalledWith(pointsA, expect.objectContaining({ styleUrl: defaultMapStyleUrl }))

    await act(async () => render.resolve(rendered(pointsA)))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.streetMap).toMatchObject({
      placesKey: keyA,
      url: 'blob:street-1',
      positions: [{ key: 'wifi:w1', x: 507, y: 317 }],
      metersPerPixel: 3.8,
    })
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
      placesKey: keyA,
      styleUrl: defaultMapStyleUrl,
      imageType: 'image/png',
      imageBytes: expect.any(ArrayBuffer),
    }))
    expect(mocks.render).toHaveBeenCalledTimes(1)
  })

  it('waits until the pack has been refreshed before drawing', async () => {
    mocks.render.mockResolvedValue(rendered(pointsA))
    const { result, rerender } = renderHook(
      ({ canRender }) => useCrisisPackMap(pointsA, { isOnline: true, canRender }),
      { initialProps: { canRender: false } },
    )
    await waitFor(() => expect(mocks.read).toHaveBeenCalled())
    expect(mocks.render).not.toHaveBeenCalled()

    rerender({ canRender: true })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(mocks.render).toHaveBeenCalledTimes(1)
  })

  it('uses the stored street map when it matches, even offline, without drawing again', async () => {
    mocks.read.mockResolvedValue(stored(keyA))
    const { result } = renderHook(() => useCrisisPackMap(pointsA, { isOnline: false, canRender: true }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.streetMap).toMatchObject({ placesKey: keyA, attribution: 'stored attribution', createdAt: '2026-10-01T00:00:00.000Z' })
    expect(mocks.render).not.toHaveBeenCalled()
  })

  it('never returns a stored street map made for other places or another style', async () => {
    mocks.read.mockResolvedValue(stored(keyB))
    const { result } = renderHook(() => useCrisisPackMap(pointsA, { isOnline: false, canRender: true }))
    await waitFor(() => expect(mocks.read).toHaveBeenCalled())
    await act(async () => undefined)
    expect(result.current).toEqual({ status: 'none' })
    expect(mocks.render).not.toHaveBeenCalled()

    const otherStyle = crisisPackPlacesKey(pointsA, 'https://tiles.example/other-style')
    mocks.read.mockResolvedValue(stored(otherStyle))
    const second = renderHook(() => useCrisisPackMap(pointsA, { isOnline: false, canRender: true }))
    await act(async () => undefined)
    expect(second.result.current.streetMap).toBeUndefined()
  })

  it('drops the shown street map as soon as the places change', async () => {
    mocks.read.mockResolvedValue(stored(keyA))
    mocks.render.mockImplementation(pendingUntilAborted)
    const { result, rerender } = renderHook(
      ({ points }) => useCrisisPackMap(points, { isOnline: true, canRender: true }),
      { initialProps: { points: pointsA } },
    )
    await waitFor(() => expect(result.current.status).toBe('ready'))

    rerender({ points: pointsB })
    expect(result.current.streetMap).toBeUndefined()
  })

  it('reports a failed render without throwing', async () => {
    mocks.render.mockRejectedValue(new DOMException('Tainted canvases may not be exported.', 'SecurityError'))
    const { result } = renderHook(() => useCrisisPackMap(pointsA, { isOnline: true, canRender: true }))
    await waitFor(() => expect(result.current.status).toBe('failed'))
    expect(result.current.streetMap).toBeUndefined()
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('cancels the render on unmount', async () => {
    mocks.render.mockImplementation(pendingUntilAborted)
    const { unmount } = renderHook(() => useCrisisPackMap(pointsA, { isOnline: true, canRender: true }))
    await waitFor(() => expect(mocks.render).toHaveBeenCalledTimes(1))
    const { signal } = mocks.render.mock.calls[0][1] as { signal: AbortSignal }
    expect(signal.aborted).toBe(false)
    unmount()
    expect(signal.aborted).toBe(true)
  })

  it('runs one render at a time and never shows the cancelled one', async () => {
    const first = deferred<RenderedCrisisPackMap>()
    mocks.render.mockReturnValueOnce(first.promise).mockResolvedValueOnce(rendered(pointsB))
    const { result, rerender } = renderHook(
      ({ points }) => useCrisisPackMap(points, { isOnline: true, canRender: true }),
      { initialProps: { points: pointsA } },
    )
    await waitFor(() => expect(mocks.render).toHaveBeenCalledTimes(1))

    rerender({ points: pointsB })
    await act(async () => undefined)
    expect((mocks.render.mock.calls[0][1] as { signal: AbortSignal }).signal.aborted).toBe(true)
    expect(mocks.render).toHaveBeenCalledTimes(1)

    await act(async () => first.resolve(rendered(pointsA)))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(mocks.render).toHaveBeenCalledTimes(2)
    expect(result.current.streetMap?.placesKey).toBe(keyB)
    expect(mocks.save).toHaveBeenCalledTimes(1)
  })

  it('frees the picture URL when it is replaced or the page closes', async () => {
    mocks.read.mockResolvedValue(stored(keyA))
    const { result, unmount } = renderHook(() => useCrisisPackMap(pointsA, { isOnline: false, canRender: true }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:street-1')
  })

  it('returns nothing when no place has a map location', () => {
    const { result } = renderHook(() => useCrisisPackMap([], { isOnline: true, canRender: true }))
    expect(result.current).toEqual({ status: 'none' })
    expect(mocks.read).not.toHaveBeenCalled()
  })
})

describe('waitForStreetMapDecode', () => {
  const originalDecode = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'decode')

  afterEach(() => {
    vi.useRealTimers()
    if (originalDecode) Object.defineProperty(HTMLImageElement.prototype, 'decode', originalDecode)
    else Reflect.deleteProperty(HTMLImageElement.prototype, 'decode')
  })

  it('resolves once the picture is decoded', async () => {
    const decode = deferred<void>()
    Object.defineProperty(HTMLImageElement.prototype, 'decode', { configurable: true, value: () => decode.promise })
    let done = false
    const wait = waitForStreetMapDecode('blob:street').then(() => {
      done = true
    })
    await Promise.resolve()
    expect(done).toBe(false)
    decode.resolve()
    await wait
    expect(done).toBe(true)
  })

  it('stops waiting after 2 seconds, and when decoding fails', async () => {
    vi.useFakeTimers()
    Object.defineProperty(HTMLImageElement.prototype, 'decode', { configurable: true, value: () => new Promise(() => undefined) })
    let done = false
    void waitForStreetMapDecode('blob:street').then(() => {
      done = true
    })
    await vi.advanceTimersByTimeAsync(1999)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(done).toBe(true)

    Object.defineProperty(HTMLImageElement.prototype, 'decode', { configurable: true, value: () => Promise.reject(new Error('bad image')) })
    await expect(waitForStreetMapDecode('blob:broken')).resolves.toBeUndefined()
  })
})
