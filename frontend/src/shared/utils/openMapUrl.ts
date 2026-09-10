export interface MapLocation {
  latitude?: number
  longitude?: number
  query: string
}

export function openMapUrl({ latitude, longitude, query }: MapLocation): string {
  if (latitude != null && longitude != null) {
    return `https://www.openstreetmap.org/?mlat=${encodeURIComponent(String(latitude))}&mlon=${encodeURIComponent(String(longitude))}#map=18/${encodeURIComponent(String(latitude))}/${encodeURIComponent(String(longitude))}`
  }

  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(query)}`
}
