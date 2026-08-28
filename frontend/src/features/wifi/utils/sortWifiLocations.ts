import type { WifiLocation } from '../../../data/contracts'

function distanceFrom(location: WifiLocation): number {
  return location.distanceKm ?? Number.POSITIVE_INFINITY
}

export function sortWifiLocations(
  records: WifiLocation[],
  usualSpotId: string | null,
): WifiLocation[] {
  return [...records].sort((left, right) => {
    if (left.id === usualSpotId) return -1
    if (right.id === usualSpotId) return 1
    return distanceFrom(left) - distanceFrom(right)
  })
}
