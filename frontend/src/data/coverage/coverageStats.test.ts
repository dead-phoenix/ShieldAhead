import { afterEach, describe, expect, it, vi } from 'vitest'
import { bundledCoverageStats, loadCoverageStats } from './coverageStats'

describe('coverage stats', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('reads bundled wifi.json and charities.json entry counts', () => {
    expect(bundledCoverageStats.coverage).toBe('All of VIC')
    expect(bundledCoverageStats.wifiLocations).toBeGreaterThanOrEqual(0)
    expect(bundledCoverageStats.supportServices).toBeGreaterThanOrEqual(0)
  })

  it('prefers live pipeline counts from /api/stats', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://127.0.0.1:5001')
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({
        wifiLocations: 412,
        supportServices: 88,
        coverage: 'All of VIC',
      }),
    } as Response)

    const stats = await loadCoverageStats(fetcher)

    expect(fetcher.mock.calls[0][0].toString()).toBe('http://127.0.0.1:5001/api/stats')
    expect(stats).toEqual({
      wifiLocations: 412,
      supportServices: 88,
      coverage: 'All of VIC',
    })
  })
})
