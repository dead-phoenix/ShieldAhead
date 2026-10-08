import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMyArea } from '../../storage/myAreaStorage'
import { refreshNearbySnapshot } from './nearbySnapshot'
import { prepareOffline } from './prepareOffline'

vi.mock('../../storage/myAreaStorage', () => ({ getMyArea: vi.fn() }))
vi.mock('./nearbySnapshot', () => ({ refreshNearbySnapshot: vi.fn() }))

const manifestResponse = (files: string[]) => new Response(JSON.stringify({ files: files.map((file) => ({ file })) }), { status: 200 })

function stubServiceWorkerReady() {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { ready: Promise.resolve({ active: {} }) },
  })
}

function stubCaches(cachedUrls: string[]) {
  vi.stubGlobal('caches', {
    match: vi.fn((request: Request | string) => {
      const url = typeof request === 'string' ? request : request.url
      const path = new URL(url, 'http://localhost/').pathname
      return Promise.resolve(cachedUrls.some((cached) => path.endsWith(cached)) ? new Response('') : undefined)
    }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  stubServiceWorkerReady()
  vi.mocked(getMyArea).mockReturnValue(null)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('prepareOffline', () => {
  it('resolves to not-ready instead of hanging when serviceWorker.ready never resolves', async () => {
    vi.useFakeTimers()
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: new Promise(() => {}) }, // never resolves — simulates a stuck registration
    })

    const resultPromise = prepareOffline()
    await vi.advanceTimersByTimeAsync(10_000)
    const result = await resultPromise

    expect(result.status).toBe('not-ready')
    vi.useRealTimers()
  })

  it('reports not-ready when this browser has no service worker support', async () => {
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: undefined })
    const result = await prepareOffline()
    expect(result.status).toBe('not-ready')
  })

  it('reports ready when the shell and every manifest file are already cached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(manifestResponse(['offline-wifi.json'])))
    stubCaches(['/index.html', '/data/offline-wifi.json'])

    const result = await prepareOffline()

    expect(result.status).toBe('ready')
    expect(result.missingUrls).toEqual([])
  })

  it('reports partial when some but not all required files are cached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(manifestResponse(['offline-wifi.json', 'offline-charities.json'])))
    stubCaches(['/index.html', '/data/offline-wifi.json'])

    const result = await prepareOffline()

    expect(result.status).toBe('partial')
    expect(result.missingUrls).toEqual(['/data/offline-charities.json'])
  })

  it('reports not-ready when nothing required is cached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(manifestResponse(['offline-wifi.json'])))
    stubCaches([])

    const result = await prepareOffline()

    expect(result.status).toBe('not-ready')
  })

  it('refreshes the nearby snapshot only when My area is set', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(manifestResponse([])))
    stubCaches(['/index.html'])
    vi.mocked(getMyArea).mockReturnValue({ postcode: '3450', label: 'Castlemaine 3450', savedAt: '2026-01-01' })
    vi.mocked(refreshNearbySnapshot).mockResolvedValue('saved')

    const result = await prepareOffline()

    expect(refreshNearbySnapshot).toHaveBeenCalledTimes(1)
    expect(result.snapshotResult).toBe('saved')
    expect(result.status).toBe('ready')
  })

  it('does not call the snapshot refresh when no My area is set', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(manifestResponse([])))
    stubCaches(['/index.html'])

    await prepareOffline()

    expect(refreshNearbySnapshot).not.toHaveBeenCalled()
  })
})
