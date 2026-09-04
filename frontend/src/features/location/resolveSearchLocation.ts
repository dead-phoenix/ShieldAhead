const VIC_POSTCODE = /^3\d{3}$/
const NOMINATIM_HEADERS = {
  Accept: 'application/json',
}

export class LocationResolveError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LocationResolveError'
  }
}

interface NominatimAddress {
  postcode?: string
  suburb?: string
  town?: string
  village?: string
  city?: string
  municipality?: string
  state?: string
}

interface NominatimResult {
  display_name?: string
  address?: NominatimAddress
}

function firstPostcode(value: string | undefined): string {
  const match = value?.match(/\b(3\d{3})\b/)
  return match?.[1] ?? ''
}

function areaLabel(address: NominatimAddress | undefined, postcode: string): string {
  const place = address?.suburb || address?.town || address?.village || address?.city
    || address?.municipality
  return place ? `${place} ${postcode}` : postcode
}

function assertVictorian(postcode: string, state?: string) {
  const inVictoria = !state || /victoria/i.test(state) || state === 'VIC'
  if (!VIC_POSTCODE.test(postcode) || !inVictoria) {
    throw new LocationResolveError(
      'ShieldAhead currently covers Victoria. Enter a Victorian suburb or postcode.',
    )
  }
}

async function readNominatim(url: URL): Promise<NominatimResult> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 12_000)
  try {
    const response = await fetch(url, { headers: NOMINATIM_HEADERS, signal: controller.signal })
    if (!response.ok) {
      throw new LocationResolveError('We could not look up that location. Try a four-digit postcode.')
    }
    return await response.json() as NominatimResult
  } catch (error) {
    if (error instanceof LocationResolveError) throw error
    throw new LocationResolveError('We could not look up that location. Try a four-digit postcode.')
  } finally {
    window.clearTimeout(timeout)
  }
}

export function parseManualLocationQuery(value: string): { kind: 'postcode'; postcode: string } | { kind: 'place'; query: string } | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^\d{4}$/.test(trimmed)) return { kind: 'postcode', postcode: trimmed }
  const embedded = firstPostcode(trimmed)
  if (embedded) return { kind: 'postcode', postcode: embedded }
  return { kind: 'place', query: trimmed }
}

export async function resolvePostcodeLookup(postcode: string): Promise<{ postcode: string; label: string }> {
  if (!VIC_POSTCODE.test(postcode)) {
    throw new LocationResolveError(
      'Enter a Victorian postcode (3000–3999), or a suburb name in Victoria.',
    )
  }
  return { postcode, label: postcode }
}

export async function resolvePlaceName(query: string): Promise<{ postcode: string; label: string }> {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', `${query}, Victoria, Australia`)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('limit', '1')
  url.searchParams.set('countrycodes', 'au')

  const results = await readNominatim(url) as NominatimResult | NominatimResult[]
  const match = Array.isArray(results) ? results[0] : results
  const postcode = firstPostcode(match?.address?.postcode)
  if (!match || !postcode) {
    throw new LocationResolveError('We could not find that suburb. Try a nearby postcode instead.')
  }
  assertVictorian(postcode, match.address?.state)
  return { postcode, label: areaLabel(match.address, postcode) }
}

export async function resolveCurrentCoordinates(
  latitude: number,
  longitude: number,
): Promise<{ postcode: string; label: string }> {
  const url = new URL('https://nominatim.openstreetmap.org/reverse')
  url.searchParams.set('lat', String(latitude))
  url.searchParams.set('lon', String(longitude))
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('zoom', '16')

  const result = await readNominatim(url)
  const postcode = firstPostcode(result.address?.postcode)
  if (!postcode) {
    throw new LocationResolveError(
      'We could not match that position to a postcode. Enter a suburb or postcode instead.',
    )
  }
  assertVictorian(postcode, result.address?.state)
  return { postcode, label: areaLabel(result.address, postcode) }
}

export function readBrowserPosition(): Promise<GeolocationPosition> {
  if (!('geolocation' in navigator)) {
    return Promise.reject(new LocationResolveError(
      'This browser cannot share a current location. Enter a suburb or postcode instead.',
    ))
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, (error) => {
      if (error.code === error.PERMISSION_DENIED) {
        reject(new LocationResolveError(
          'Location permission was declined. Enter a suburb or postcode instead.',
        ))
        return
      }
      reject(new LocationResolveError(
        'We could not read your current location. Enter a suburb or postcode instead.',
      ))
    }, {
      enableHighAccuracy: false,
      timeout: 12_000,
      maximumAge: 300_000,
    })
  })
}
