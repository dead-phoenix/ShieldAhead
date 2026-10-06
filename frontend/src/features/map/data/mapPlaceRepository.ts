import type { DatasetMetadata, DatasetResult, SupportService, WifiLocation } from '../../../data/contracts'
import { fetchEmergencyFacilities } from '../../../data/api/facilitiesApi'
import { getSupportServiceRepository } from '../../../data/supportServiceRepository'
import type { SupportServiceRepository, WifiRepository } from '../../../data/repositories'
import { getWifiRepository } from '../../../data/wifiRepository'
import {
  emergencyFacilityToMapPlace,
  metadataOrigin,
  supportServiceToMapPlace,
  wifiLocationToMapPlace,
} from './mapPlaceAdapters'
import type {
  MapDataOrigin,
  MapPlace,
  MapPlaceDataset,
  MapPlaceRepository,
  MapPlaceResult,
  MapPlaceSourceError,
  NearbyPlacesQuery,
} from '../model/mapTypes'

interface CombinedMapPlaceRepositoryOptions {
  wifiRepository: WifiRepository
  supportRepository: SupportServiceRepository
  postcode: string
}

type SupportedSource = 'wifi' | 'support'

// Wi-Fi is listed per access point, so one site like "Flinders Street Station -
// Concourse" and "Flinders Street Station - ML_Platform1/2" becomes one entry.
function wifiSiteName(name: string): string {
  return name.split(' - ')[0].trim()
}

function wifiSiteKey(place: MapPlace): string {
  return `${wifiSiteName(place.name)}|${place.postcode ?? ''}`
}

function siteEntry(members: MapPlace[]): MapPlace {
  const [nearest] = [...members].sort(
    (a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity),
  )
  if (members.length === 1) return nearest
  const siteName = wifiSiteName(nearest.name)
  return {
    ...nearest,
    id: `wifi-site:${siteName}|${nearest.postcode ?? ''}`,
    name: siteName,
    accessPoints: members.map((member) => ({
      name: member.name,
      latitude: member.latitude,
      longitude: member.longitude,
    })),
  }
}

export function groupWifiAccessPoints(places: MapPlace[]): MapPlace[] {
  const groups = new Map<string, MapPlace[]>()
  for (const place of places) {
    if (place.kind !== 'wifi') continue
    const key = wifiSiteKey(place)
    groups.set(key, [...(groups.get(key) ?? []), place])
  }
  const emitted = new Set<string>()
  const result: MapPlace[] = []
  for (const place of places) {
    if (place.kind !== 'wifi') {
      result.push(place)
      continue
    }
    const key = wifiSiteKey(place)
    if (emitted.has(key)) continue
    emitted.add(key)
    result.push(siteEntry(groups.get(key) ?? [place]))
  }
  return result
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error && reason.message
    ? reason.message
    : 'Information could not be loaded. Try again.'
}

function latestGeneratedAt(datasets: MapPlaceDataset[]): string {
  const timestamps = datasets
    .map(({ metadata }) => Date.parse(metadata.generatedAt))
    .filter(Number.isFinite)

  return timestamps.length > 0
    ? new Date(Math.max(...timestamps)).toISOString()
    : new Date(0).toISOString()
}

function combinedOrigin(origins: MapDataOrigin[]): MapPlaceResult['dataOrigin'] {
  return origins.every((origin) => origin === 'cache')
    ? 'cache'
    : origins.every((origin) => origin === 'network')
      ? 'network'
      : 'mixed'
}

function datasetEntry(source: SupportedSource, metadata: DatasetMetadata): MapPlaceDataset {
  return { source, metadata }
}

function addDataset<T>(
  source: SupportedSource,
  result: DatasetResult<T>,
  adapt: (record: T, origin: MapDataOrigin) => MapPlace,
  places: MapPlace[],
  datasets: MapPlaceDataset[],
  origins: MapDataOrigin[],
) {
  const origin = metadataOrigin(result.metadata)
  origins.push(origin)
  datasets.push(datasetEntry(source, result.metadata))
  places.push(...result.records.map((record) => adapt(record, origin)))
}

export function createCombinedMapPlaceRepository({
  wifiRepository,
  supportRepository,
  postcode,
}: CombinedMapPlaceRepositoryOptions): MapPlaceRepository {
  return {
    async findNearby() {
      const [wifi, support, emergency] = await Promise.allSettled([
        wifiRepository.list(),
        supportRepository.list(),
        fetchEmergencyFacilities(postcode),
      ])

      const places: MapPlace[] = []
      const datasets: MapPlaceDataset[] = []
      const sourceErrors: MapPlaceSourceError[] = []
      const origins: MapDataOrigin[] = []
      const emergencyLimitations: string[] = []

      if (wifi.status === 'fulfilled') {
        addDataset<WifiLocation>(
          'wifi',
          wifi.value,
          wifiLocationToMapPlace,
          places,
          datasets,
          origins,
        )
      } else {
        sourceErrors.push({ source: 'wifi', message: errorMessage(wifi.reason) })
      }

      if (support.status === 'fulfilled') {
        addDataset<SupportService>(
          'support',
          support.value,
          supportServiceToMapPlace,
          places,
          datasets,
          origins,
        )
      } else {
        sourceErrors.push({ source: 'support', message: errorMessage(support.reason) })
      }

      // Emergency facilities (hospital/police/fire/ambulance) are fetched
      // directly rather than through the offline-aware repository/cache
      // layer the other two sources use, so they're additive here: a
      // failure just means those markers are missing this load, not a
      // dataset-level error banner like wifi/support get.
      if (emergency.status === 'fulfilled') {
        places.push(...emergency.value.records.map(emergencyFacilityToMapPlace))
        emergencyLimitations.push(...emergency.value.metadata.limitations)
      }

      if (datasets.length === 0) {
        throw new Error(sourceErrors.map(({ message }) => message).join(' '))
      }

      return {
        places: groupWifiAccessPoints(places),
        datasets,
        sourceErrors,
        generatedAt: latestGeneratedAt(datasets),
        limitations: [...datasets.flatMap(({ metadata }) => metadata.limitations), ...emergencyLimitations],
        dataOrigin: combinedOrigin(origins),
      }
    },
  }
}

export function getMapPlaceRepository(query: NearbyPlacesQuery): MapPlaceRepository {
  return createCombinedMapPlaceRepository({
    wifiRepository: getWifiRepository(query.postcode),
    supportRepository: getSupportServiceRepository(query.postcode),
    postcode: query.postcode,
  })
}
