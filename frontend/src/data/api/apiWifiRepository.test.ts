import { describe, expect, it, vi } from 'vitest'
import { createApiWifiRepository, normalizeWifiDataset } from './apiWifiRepository'

const apiPayload = {
  records: [
    {
      id: 'wifi-1',
      name: 'Example Wi-Fi',
      address: null,
      suburb: '',
      postcode: '',
      latitude: null,
      longitude: 144.263,
      distanceKm: null,
      openingHours: null,
      accessConditions: null,
      verificationStatus: 'likely',
      dataUpdatedAt: '2026-08-29T00:00:00.000Z',
    },
  ],
  metadata: {
    version: '1.0',
    generatedAt: '2026-08-29T00:00:00.000Z',
    sourceName: 'Backend fixture',
    coverageAreas: ['Regional Victoria'],
    limitations: [],
  },
}

function responseWith(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response
}

describe('API Wi-Fi repository', () => {
  it('requests the configured API with the saved postcode', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    fetchMock.mockResolvedValue(responseWith(apiPayload))
    const repository = createApiWifiRepository({
      baseUrl: 'http://127.0.0.1:5001/',
      postcode: '3453',
      fetcher: fetchMock as unknown as typeof fetch,
    })

    await repository.list()

    const requestedUrl = fetchMock.mock.calls[0][0] as URL
    expect(requestedUrl.toString()).toBe('http://127.0.0.1:5001/api/wifi?postcode=3453')
  })

  it('normalizes backend nulls and blank regional fields safely', () => {
    const result = normalizeWifiDataset(apiPayload)

    expect(result.records[0]).toMatchObject({
      id: 'wifi-1',
      suburb: 'Area not confirmed',
      postcode: '',
      longitude: 144.263,
      accessConditions: [],
      verificationStatus: 'likely',
    })
    expect(result.records[0].address).toBeUndefined()
    expect(result.records[0].latitude).toBeUndefined()
    expect(result.records[0].distanceKm).toBeUndefined()
    expect(result.records[0].openingHours).toBeUndefined()
  })

  it('rejects a non-successful HTTP response', async () => {
    const fetcher = vi.fn(async () => responseWith({}, 500)) as unknown as typeof fetch
    const repository = createApiWifiRepository({
      baseUrl: 'http://127.0.0.1:5001',
      postcode: '3453',
      fetcher,
    })

    await expect(repository.list()).rejects.toThrow('status 500')
  })

  it('rejects an invalid response contract', () => {
    expect(() => normalizeWifiDataset({ records: {}, metadata: {} })).toThrow(
      'invalid response shape',
    )
  })

  it('calls the same-origin API when no base URL is configured', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    fetchMock.mockResolvedValue(responseWith(apiPayload))
    const repository = createApiWifiRepository({
      baseUrl: '',
      postcode: '3453',
      fetcher: fetchMock as unknown as typeof fetch,
    })

    await repository.list()

    expect((fetchMock.mock.calls[0][0] as URL).toString()).toBe(
      `${window.location.origin}/api/wifi?postcode=3453`,
    )
  })
})
