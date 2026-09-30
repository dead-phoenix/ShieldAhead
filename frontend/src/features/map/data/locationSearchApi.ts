export interface SearchLocationResult {
  postcode: string
  label: string
  latitude?: number
  longitude?: number
}

interface LocationSearchResponse {
  records?: unknown
}

function apiOrigin(): string {
  const configured = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/$/, '')
  return configured || window.location.origin
}

function normalizeRecord(value: unknown): SearchLocationResult | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const postcode = typeof record.postcode === 'string' ? record.postcode.trim() : ''
  const label = typeof record.label === 'string' ? record.label.trim() : ''
  if (!/^3\d{3}$/.test(postcode) || !label) return null
  return {
    postcode,
    label,
    latitude: typeof record.latitude === 'number' && Number.isFinite(record.latitude)
      ? record.latitude
      : undefined,
    longitude: typeof record.longitude === 'number' && Number.isFinite(record.longitude)
      ? record.longitude
      : undefined,
  }
}

export async function searchLocations(query: string): Promise<SearchLocationResult[]> {
  const trimmed = query.trim()
  if (/^3\d{3}$/.test(trimmed)) return [{ postcode: trimmed, label: trimmed }]

  const url = new URL('/api/locations/search', `${apiOrigin()}/`)
  url.searchParams.set('q', trimmed)
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 12_000)

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (response.status === 404) {
      throw new Error('Suburb search is not available yet. Enter a Victorian postcode instead.')
    }
    if (!response.ok) {
      throw new Error('We could not search for that area. Check the spelling or enter a Victorian postcode.')
    }
    const payload = await response.json() as LocationSearchResponse
    const records = Array.isArray(payload.records) ? payload.records : []
    return records.map(normalizeRecord).filter((record): record is SearchLocationResult => Boolean(record))
  } catch (reason) {
    if (controller.signal.aborted) {
      throw new Error('The area search took too long. Enter a Victorian postcode or try again.', { cause: reason })
    }
    if (reason instanceof TypeError) {
      throw new Error('Area search could not be reached. Enter a Victorian postcode or try again.', { cause: reason })
    }
    throw reason
  } finally {
    window.clearTimeout(timeout)
  }
}

export async function resolveCoordinates(latitude: number, longitude: number): Promise<SearchLocationResult> {
  const url = new URL('/api/locations/reverse', `${apiOrigin()}/`)
  url.searchParams.set('latitude', String(latitude))
  url.searchParams.set('longitude', String(longitude))
  const response = await fetch(url, { headers: { Accept: 'application/json' } })
  if (response.status === 404) {
    throw new Error('Current-location search is not available yet. Enter a Victorian postcode instead.')
  }
  if (!response.ok) throw new Error('We could not find an area for your current location. Enter a postcode instead.')
  const result = normalizeRecord(await response.json())
  if (!result) throw new Error('The location service returned an incomplete area. Enter a postcode instead.')
  return result
}
