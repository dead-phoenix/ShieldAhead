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

  it('keeps query-string fixtures on Mock data even in API mode', async () => {
    vi.stubEnv('VITE_DATA_SOURCE', 'api')
    const repository = getWifiRepository('no-coverage', '3453')

    const result = await repository.list()

    expect(result.records).toEqual([])
    expect(result.metadata.version).toBe('prototype-no-coverage-v1')
  })

  it('uses the configured API repository only when API mode is enabled', async () => {
    vi.stubEnv('VITE_DATA_SOURCE', 'api')
    vi.stubEnv('VITE_API_BASE_URL', 'http://127.0.0.1:5001')
    const fetchMock = vi.fn<typeof fetch>()
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => apiPayload,
    } as Response)
    vi.stubGlobal('fetch', fetchMock)

    const repository = getWifiRepository(null, '3453')
    await repository.list()

    expect((fetchMock.mock.calls[0][0] as URL).toString()).toBe(
      'http://127.0.0.1:5001/api/wifi?postcode=3453',
    )
  })
})
