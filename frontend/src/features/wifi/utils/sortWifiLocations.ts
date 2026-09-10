import type { WifiLocation } from '../../../data/contracts'

export const WIFI_LIST_LIMIT = 10

function distanceFrom(location: WifiLocation): number {
  return location.distanceKm ?? Number.POSITIVE_INFINITY
}

function verificationRank(location: WifiLocation): number {
  if (location.verificationStatus === 'confirmed') return 0
  if (location.verificationStatus === 'likely') return 1
  return 2
}

export function sortWifiLocations(
  records: WifiLocation[],
  usualSpotId: string | null,
): WifiLocation[] {
  return [...records].sort((left, right) => {
    if (left.id === usualSpotId) return -1
    if (right.id === usualSpotId) return 1

    const leftDistance = distanceFrom(left)
    const rightDistance = distanceFrom(right)
    if (leftDistance !== rightDistance) return leftDistance - rightDistance

    return verificationRank(left) - verificationRank(right)
  })
}

export function selectWifiLocationsForList(
  records: WifiLocation[],
  usualSpotId: string | null,
  limit = WIFI_LIST_LIMIT,
): WifiLocation[] {
  return sortWifiLocations(records, usualSpotId).slice(0, limit)
}
