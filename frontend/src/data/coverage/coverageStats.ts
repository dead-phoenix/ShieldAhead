import charityCoverage from './charities.json' with { type: 'json' }
import wifiCoverage from './wifi.json' with { type: 'json' }

export interface CoverageStats {
  wifiLocations: number
  supportServices: number
  coverage: string
}

function countEntries(data: unknown): number {
  if (Array.isArray(data)) return data.length
  if (data && typeof data === 'object') {
    const record = data as { records?: unknown; count?: unknown }
    if (Array.isArray(record.records)) return record.records.length
    if (typeof record.count === 'number' && Number.isFinite(record.count)) {
      return record.count
    }
  }
  return 0
}

export const bundledCoverageStats: CoverageStats = {
  wifiLocations: countEntries(wifiCoverage),
  supportServices: countEntries(charityCoverage),
  coverage: 'All of VIC',
}

export async function loadCoverageStats(
  fetcher: typeof fetch = fetch,
): Promise<CoverageStats> {
  const configuredOrigin = String(import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/$/, '')
  const origin = configuredOrigin || (typeof window === 'undefined' ? '' : window.location.origin)
  if (!origin) return bundledCoverageStats

  try {
    const response = await fetcher(new URL('/api/stats', `${origin}/`), {
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return bundledCoverageStats
    const payload = (await response.json()) as Record<string, unknown>
    return {
      wifiLocations: Number(payload.wifiLocations) || bundledCoverageStats.wifiLocations,
      supportServices: Number(payload.supportServices) || bundledCoverageStats.supportServices,
      coverage: typeof payload.coverage === 'string' && payload.coverage.trim()
        ? payload.coverage.trim()
        : bundledCoverageStats.coverage,
    }
  } catch {
    return bundledCoverageStats
  }
}
