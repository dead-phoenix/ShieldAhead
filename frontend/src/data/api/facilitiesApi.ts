import type { DatasetMetadata, DatasetResult, EmergencyFacility, FacilityType } from '../contracts'
import { resolveApiUrl } from './resolveApiUrl'

const FACILITY_TYPES: readonly FacilityType[] = ['Hospital', 'Police Station', 'Fire Station', 'Ambulance Station']

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Facilities API returned an invalid ${field}.`)
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

function isFacilityType(value: unknown): value is FacilityType {
  return typeof value === 'string' && (FACILITY_TYPES as readonly string[]).includes(value)
}

function normalizeFacility(value: unknown): EmergencyFacility {
  if (!isObject(value)) {
    throw new Error('Facilities API returned a record that is not an object.')
  }
  if (!isFacilityType(value.facilityType)) {
    throw new Error('Facilities API returned a record with an unrecognised facility type.')
  }

  return {
    id: requiredString(value.id, 'record id'),
    name: requiredString(value.name, 'record name'),
    facilityType: value.facilityType,
    address: optionalString(value.address),
    suburb: optionalString(value.suburb),
    postcode: optionalString(value.postcode),
    latitude: optionalNumber(value.latitude),
    longitude: optionalNumber(value.longitude),
    distanceKm: optionalNumber(value.distanceKm),
    phone: optionalString(value.phone),
    tags: stringArray(value.tags),
    dataUpdatedAt: requiredString(value.dataUpdatedAt, 'record update date'),
  }
}

function normalizeMetadata(value: unknown): DatasetMetadata {
  if (!isObject(value)) {
    throw new Error('Facilities API returned invalid dataset metadata.')
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

export function normalizeFacilitiesDataset(value: unknown): DatasetResult<EmergencyFacility> {
  if (!isObject(value) || !Array.isArray(value.records)) {
    throw new Error('Facilities API returned an invalid response shape.')
  }

  return {
    records: value.records.map(normalizeFacility),
    metadata: normalizeMetadata(value.metadata),
  }
}

export async function fetchEmergencyFacilities(
  postcode: string,
  types: FacilityType[] = [],
  timeoutMs = 20_000,
): Promise<DatasetResult<EmergencyFacility>> {
  const configuredOrigin = String(import.meta.env.VITE_API_BASE_URL ?? '').trim()
  const url = resolveApiUrl(configuredOrigin, '/api/facilities', postcode)
  types.forEach((type) => url.searchParams.append('type', type))

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`Facilities API request failed with status ${response.status}.`)
    }
    return normalizeFacilitiesDataset(await response.json())
  } catch (reason) {
    if (controller.signal.aborted || (reason instanceof Error && reason.name === 'AbortError')) {
      throw new Error(
        'Emergency facility information took too long to load. Check your connection and try again.',
        { cause: reason },
      )
    }
    if (reason instanceof TypeError) {
      throw new Error(
        'Emergency facility information could not be reached. Check your connection and try again.',
        { cause: reason },
      )
    }
    throw reason
  } finally {
    window.clearTimeout(timeout)
  }
}
