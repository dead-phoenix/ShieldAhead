import { afterEach, describe, expect, it, vi } from 'vitest'
import { getWifiRepository } from './wifiRepository'

const apiPayload = {
  records: [],
  metadata: {
    version: '1.0',
    generatedAt: '2026-08-29T00:00:00.000Z',
    sourceName: 'Backend fixture',
    coverageAreas: [],
    limitations: [],
  },
}

describe('Wi-Fi repository selection', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('always uses the configured API repository', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://127.0.0.1:5001')
    const fetchMock = vi.fn<typeof fetch>()
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => apiPayload,
    } as Response)
    vi.stubGlobal('fetch', fetchMock)

    const repository = getWifiRepository('3453')
    await repository.list()

    const requestedUrl = fetchMock.mock.calls[0][0] as URL
    expect(requestedUrl.origin + requestedUrl.pathname).toBe('http://127.0.0.1:5001/api/wifi')
    expect(requestedUrl.searchParams.get('postcode')).toBe('3453')
  })
})
