import type {
  DatasetMetadata,
  DatasetResult,
  WifiLocation,
} from '../contracts'
import type { WifiRepository } from '../repositories'

interface ApiWifiRepositoryOptions {
  baseUrl: string
  postcode: string
  timeoutMs?: number
  fetcher?: typeof fetch
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Wi-Fi API returned an invalid ${field}.`)
  }
  return value.trim()
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
}

function normalizeWifiLocation(value: unknown): WifiLocation {
  if (!isObject(value)) {
    throw new Error('Wi-Fi API returned a record that is not an object.')
  }

  const verificationStatus = value.verificationStatus === 'confirmed' || value.verificationStatus === 'likely'
    ? value.verificationStatus
    : undefined

  return {
    id: requiredString(value.id, 'record id'),
    name: requiredString(value.name, 'record name'),
    address: optionalString(value.address),
    suburb: optionalString(value.suburb) ?? 'Area not confirmed',
    postcode: typeof value.postcode === 'string' ? value.postcode.trim() : '',
    latitude: optionalNumber(value.latitude),
    longitude: optionalNumber(value.longitude),
    distanceKm: optionalNumber(value.distanceKm),
    openingHours: optionalString(value.openingHours),
    accessConditions: stringArray(value.accessConditions),
    verificationStatus,
    dataUpdatedAt: requiredString(value.dataUpdatedAt, 'record update date'),
  }
}

function normalizeMetadata(value: unknown): DatasetMetadata {
  if (!isObject(value)) {
    throw new Error('Wi-Fi API returned invalid dataset metadata.')
  }

  const freshnessStatus = value.freshnessStatus === 'current' || value.freshnessStatus === 'stale'
    ? value.freshnessStatus
    : undefined

  return {
    version: requiredString(value.version, 'dataset version'),
    generatedAt: requiredString(value.generatedAt, 'dataset generated date'),
    sourceName: requiredString(value.sourceName, 'dataset source name'),
    coverageAreas: stringArray(value.coverageAreas),
    limitations: stringArray(value.limitations),
    freshnessStatus,
    removedRecordIds: stringArray(value.removedRecordIds),
  }
}

export function normalizeWifiDataset(value: unknown): DatasetResult<WifiLocation> {
  if (!isObject(value) || !Array.isArray(value.records)) {
    throw new Error('Wi-Fi API returned an invalid response shape.')
  }

  return {
    records: value.records.map(normalizeWifiLocation),
    metadata: normalizeMetadata(value.metadata),
  }
}

export function createApiWifiRepository({
  baseUrl,
  postcode,
  timeoutMs = 20_000,
  fetcher = fetch,
}: ApiWifiRepositoryOptions): WifiRepository {
  return {
    async list() {
      const normalizedBaseUrl = baseUrl.trim().replace(/\/$/, '')
      if (!normalizedBaseUrl) {
        throw new Error('VITE_API_BASE_URL is required when VITE_DATA_SOURCE=api.')
      }

      const url = new URL(`${normalizedBaseUrl}/api/wifi`)
      url.searchParams.set('postcode', postcode)
      const controller = new AbortController()
      const timeout = window.setTimeout(() => controller.abort(), timeoutMs)

      try {
        const response = await fetcher(url, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(`Wi-Fi API request failed with status ${response.status}.`)
        }
        return normalizeWifiDataset(await response.json())
      } finally {
        window.clearTimeout(timeout)
      }
    },
  }
}
