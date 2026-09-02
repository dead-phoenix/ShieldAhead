import type {
  DatasetMetadata,
  DatasetResult,
  SupportService,
} from '../contracts'
import type { SupportServiceRepository } from '../repositories'

interface ApiSupportServiceRepositoryOptions {
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
    throw new Error(`Support service API returned an invalid ${field}.`)
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

const AVAILABILITY_STATUSES = ['not-confirmed', 'normal', 'low', 'closed'] as const
const PARTNER_STATUSES = ['partner', 'open-referral', 'unknown'] as const

function normalizeSupportService(value: unknown): SupportService {
  if (!isObject(value)) {
    throw new Error('Support service API returned a record that is not an object.')
  }

  const availabilityStatus = AVAILABILITY_STATUSES.includes(value.availabilityStatus as never)
    ? (value.availabilityStatus as SupportService['availabilityStatus'])
    : 'not-confirmed' // fail safe to the most conservative honest state, never assume better availability than confirmed

  const partnerStatus = PARTNER_STATUSES.includes(value.partnerStatus as never)
    ? (value.partnerStatus as SupportService['partnerStatus'])
    : undefined

  const availabilityFreshness = value.availabilityFreshness === 'current' || value.availabilityFreshness === 'stale'
    ? value.availabilityFreshness
    : undefined

  // serviceTypes is an array on the wire (see charity_to_support_service in
  // the backend), but is defended here the same way stringArray defends
  // accessConditions on the wifi side — an empty/missing array still needs
  // at least one label so the UI never renders a blank category.
  const serviceTypes = stringArray(value.serviceTypes)

  return {
    id: requiredString(value.id, 'record id'),
    name: requiredString(value.name, 'record name'),
    serviceTypes: serviceTypes.length > 0 ? serviceTypes : ['Community support services'],
    address: optionalString(value.address),
    suburb: optionalString(value.suburb) ?? 'Area not confirmed',
    postcode: typeof value.postcode === 'string' ? value.postcode.trim() : '',
    latitude: optionalNumber(value.latitude),
    longitude: optionalNumber(value.longitude),
    distanceKm: optionalNumber(value.distanceKm),
    phone: optionalString(value.phone),
    website: optionalString(value.website),
    eligibility: optionalString(value.eligibility),
    partnerStatus,
    availabilityStatus,
    availabilityUpdatedAt: optionalString(value.availabilityUpdatedAt),
    availabilityFreshness,
    dataUpdatedAt: requiredString(value.dataUpdatedAt, 'record update date'),
  }
}

function normalizeMetadata(value: unknown): DatasetMetadata {
  if (!isObject(value)) {
    throw new Error('Support service API returned invalid dataset metadata.')
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

export function normalizeSupportServiceDataset(value: unknown): DatasetResult<SupportService> {
  if (!isObject(value) || !Array.isArray(value.records)) {
    throw new Error('Support service API returned an invalid response shape.')
  }

  return {
    records: value.records.map(normalizeSupportService),
    metadata: normalizeMetadata(value.metadata),
  }
}

export function createApiSupportServiceRepository({
  baseUrl,
  postcode,
  timeoutMs = 20_000,
  fetcher = fetch,
}: ApiSupportServiceRepositoryOptions): SupportServiceRepository {
  return {
    async list() {
      const normalizedBaseUrl = baseUrl.trim().replace(/\/$/, '')
      if (!normalizedBaseUrl) {
        throw new Error('VITE_API_BASE_URL is required when VITE_DATA_SOURCE=api.')
      }

      const url = new URL(`${normalizedBaseUrl}/api/charities`)
      url.searchParams.set('postcode', postcode)
      const controller = new AbortController()
      const timeout = window.setTimeout(() => controller.abort(), timeoutMs)

      try {
        const response = await fetcher(url, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(`Support service API request failed with status ${response.status}.`)
        }
        return normalizeSupportServiceDataset(await response.json())
      } finally {
        window.clearTimeout(timeout)
      }
    },
  }
}