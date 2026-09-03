import type { WifiLocation } from '../../../data/contracts'

export function wifiAreaLabel(location: Pick<WifiLocation, 'address' | 'suburb' | 'postcode'>): string {
  if (location.address) {
    const suburb = location.suburb ? `, ${location.suburb}` : ''
    const postcode = location.postcode ? ` VIC ${location.postcode}` : ''
    return `${location.address}${suburb}${postcode}`.trim()
  }

  const suburb = location.suburb && location.suburb !== 'Area not confirmed' ? location.suburb : ''
  const postcode = location.postcode ? `VIC ${location.postcode}` : ''
  return [suburb, postcode].filter(Boolean).join(' ') || 'Area not confirmed'
}

export function wifiMapsUrl(location: Pick<WifiLocation, 'latitude' | 'longitude' | 'address' | 'suburb' | 'postcode'>): string {
  const query = location.latitude != null && location.longitude != null
    ? `${location.latitude},${location.longitude}`
    : wifiAreaLabel(location)
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}
