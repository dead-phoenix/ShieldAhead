import type { WifiLocation } from '../../../data/contracts'
import { openMapUrl } from '../../../shared/utils/openMapUrl'

type WifiMapLocation = Partial<Pick<WifiLocation, 'address' | 'suburb' | 'postcode' | 'latitude' | 'longitude'>>

export function wifiAreaLabel(location: WifiMapLocation): string {
  if (location.address) {
    const suburb = location.suburb ? `, ${location.suburb}` : ''
    const postcode = location.postcode ? ` VIC ${location.postcode}` : ''
    return `${location.address}${suburb}${postcode}`.trim()
  }

  const suburb = location.suburb && location.suburb !== 'Area not confirmed' ? location.suburb : ''
  const postcode = location.postcode ? `VIC ${location.postcode}` : ''
  return [suburb, postcode].filter(Boolean).join(' ') || (
    location.latitude != null && location.longitude != null
      ? 'Exact map location available'
      : 'Area not confirmed'
  )
}

export function wifiMapsUrl(location: WifiMapLocation): string {
  return openMapUrl({
    latitude: location.latitude,
    longitude: location.longitude,
    query: wifiAreaLabel(location),
  })
}
