import { describe, expect, it } from 'vitest'
import { resolveApiUrl } from './resolveApiUrl'

describe('resolveApiUrl', () => {
  it('uses the configured API origin during local split development', () => {
    expect(resolveApiUrl('http://127.0.0.1:5001/', '/api/wifi', '3453').toString()).toBe(
      'http://127.0.0.1:5001/api/wifi?postcode=3453',
    )
  })

  it('uses the page origin when the API is served from the same link', () => {
    expect(resolveApiUrl('', '/api/wifi', '3350').toString()).toBe(
      `${window.location.origin}/api/wifi?postcode=3350`,
    )
  })
})
