import type { DatasetMetadata, DatasetResult, SupportService, WifiLocation } from '../../../data/contracts'
import { getSupportServiceRepository } from '../../../data/supportServiceRepository'
import type { SupportServiceRepository, WifiRepository } from '../../../data/repositories'
import { getWifiRepository } from '../../../data/wifiRepository'
import {
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
}

type SupportedSource = 'wifi' | 'support'

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
}: CombinedMapPlaceRepositoryOptions): MapPlaceRepository {
  return {
    async findNearby() {
      const [wifi, support] = await Promise.allSettled([
        wifiRepository.list(),
        supportRepository.list(),
      ])

      const places: MapPlace[] = []
      const datasets: MapPlaceDataset[] = []
      const sourceErrors: MapPlaceSourceError[] = []
      const origins: MapDataOrigin[] = []

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

      if (datasets.length === 0) {
        throw new Error(sourceErrors.map(({ message }) => message).join(' '))
      }

      return {
        places,
        datasets,
        sourceErrors,
        generatedAt: latestGeneratedAt(datasets),
        limitations: datasets.flatMap(({ metadata }) => metadata.limitations),
        dataOrigin: combinedOrigin(origins),
      }
    },
  }
}

export function getMapPlaceRepository(query: NearbyPlacesQuery): MapPlaceRepository {
  return createCombinedMapPlaceRepository({
    wifiRepository: getWifiRepository(query.postcode),
    supportRepository: getSupportServiceRepository(query.postcode),
  })
}
