import { describe, expect, it, vi } from 'vitest'
import {
  createApiSupportServiceRepository,
  normalizeSupportServiceDataset,
} from './apiSupportServiceRepository'

const apiPayload = {
  records: [
    {
      id: 'acnc-12345678901',
      name: 'Harcourt Community Support',
      serviceTypes: ['Emergency relief'],
      address: '81 Barker Rd, Harcourt, VIC, 3453',
      suburb: 'Harcourt',
      postcode: '3453',
      latitude: -36.9384,
      longitude: 144.2208,
      distanceKm: 1.2,
      phone: null,
      website: 'www.example.org.au/help',
      eligibility: null,
      partnerStatus: 'unknown',
      availabilityStatus: 'not-confirmed',
      availabilityUpdatedAt: null,
      availabilityFreshness: null,
      dataUpdatedAt: '2026-09-03T00:00:00.000Z',
    },
  ],
  metadata: {
    version: '1.0',
    generatedAt: '2026-09-03T00:00:00.000Z',
    sourceName: 'ACNC Registered Charities Register',
    coverageAreas: ['Harcourt', '3453'],
    limitations: ['Availability is not confirmed.'],
    freshnessStatus: 'current',
    removedRecordIds: [],
  },
}

function responseWith(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response
}

describe('API support-service repository', () => {
  it('requests charities using the saved postcode', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    fetchMock.mockResolvedValue(responseWith(apiPayload))
    const repository = createApiSupportServiceRepository({
      baseUrl: 'http://127.0.0.1:5001/',
      postcode: '3453',
      fetcher: fetchMock as unknown as typeof fetch,
    })

    await repository.list()

    const requestedUrl = fetchMock.mock.calls[0][0] as URL
    expect(requestedUrl.origin + requestedUrl.pathname).toBe('http://127.0.0.1:5001/api/charities')
    expect(requestedUrl.searchParams.get('postcode')).toBe('3453')
    expect(requestedUrl.searchParams.get('_refresh')).toBeTruthy()
  })

  it('normalizes missing fields and repairs a website without a protocol', () => {
    const result = normalizeSupportServiceDataset(apiPayload)
    const service = result.records[0]

    expect(service.website).toBe('https://www.example.org.au/help')
    expect(service.phone).toBeUndefined()
    expect(service.eligibility).toBeUndefined()
    expect(service.availabilityStatus).toBe('not-confirmed')
    expect(result.metadata.sourceName).toBe('ACNC Registered Charities Register')
  })

  it('drops unsafe website protocols instead of rendering them as links', () => {
    const result = normalizeSupportServiceDataset({
      ...apiPayload,
      records: [{ ...apiPayload.records[0], website: 'javascript:alert(1)' }],
    })

    expect(result.records[0].website).toBeUndefined()
  })

  it.each([
    [400, 'Check your saved postcode'],
    [429, 'Wait a moment'],
    [503, 'temporarily unavailable'],
    [500, 'could not be loaded'],
  ])('turns HTTP %s into recoverable user-facing copy', async (status, message) => {
    const repository = createApiSupportServiceRepository({
      baseUrl: 'http://127.0.0.1:5001',
      postcode: '3453',
      fetcher: vi.fn(async () => responseWith({}, status)) as unknown as typeof fetch,
    })

    await expect(repository.list()).rejects.toThrow(message)
  })

  it('rejects an invalid response contract', () => {
    expect(() => normalizeSupportServiceDataset({ records: {}, metadata: {} })).toThrow(
      'invalid response shape',
    )
  })
})
