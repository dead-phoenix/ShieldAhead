import type {
  LocalitiesFile,
  LocalityRecord,
  OfflineDataFile,
  OfflineDataFileName,
  OfflineServiceFile,
  PostcodesFile,
} from '../offlineData'

/** Order used to build the combined dataVersion. */
export const OFFLINE_DATA_FILE_ORDER: readonly OfflineDataFileName[] = [
  'offline-wifi.json',
  'offline-charities.json',
  'offline-emergency-services.json',
  'postcodes.json',
  'localities.json',
]

export interface OfflineDataBundle {
  wifi: OfflineServiceFile
  charities: OfflineServiceFile
  emergencyServices: OfflineServiceFile
  postcodes: PostcodesFile
  localities: LocalitiesFile
  /** The five per-file dataVersions joined with '.', in OFFLINE_DATA_FILE_ORDER. */
  dataVersion: string
}

function dataFileUrl(file: OfflineDataFileName): string {
  return `${import.meta.env.BASE_URL}data/${file}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValidBbox(value: unknown): value is [number, number, number, number] {
  return Array.isArray(value) && value.length === 4 && value.every((item) => typeof item === 'number' && Number.isFinite(item))
}

function isOfflineDataFile(value: unknown): value is OfflineDataFile<unknown> {
  return (
    isRecord(value) &&
    value.schemaVersion === 1 &&
    typeof value.dataVersion === 'string' &&
    value.dataVersion.length > 0 &&
    typeof value.generatedAt === 'string' &&
    isRecord(value.region) &&
    typeof value.region.name === 'string' &&
    isValidBbox(value.region.bbox) &&
    Array.isArray(value.records)
  )
}

/** Fetches one generated file from /data/. Rejects on network errors, non-2xx responses and unknown schema versions. */
export async function loadOfflineDataFile<T>(file: OfflineDataFileName): Promise<OfflineDataFile<T>> {
  const response = await fetch(dataFileUrl(file), { cache: 'no-cache' })
  if (!response.ok) throw new Error(`${file} could not be loaded (${response.status}).`)
  const body: unknown = await response.json()
  if (!isOfflineDataFile(body)) throw new Error(`${file} is not in a supported format.`)
  return body as OfflineDataFile<T>
}

export function joinDataVersions(versions: Partial<Record<OfflineDataFileName, string>>): string {
  return OFFLINE_DATA_FILE_ORDER.map((file) => versions[file] ?? '').join('.')
}

export async function loadOfflineDataBundle(): Promise<OfflineDataBundle> {
  const [wifi, charities, emergencyServices, postcodes, localities] = await Promise.all([
    loadOfflineDataFile<OfflineServiceFile['records'][number]>('offline-wifi.json'),
    loadOfflineDataFile<OfflineServiceFile['records'][number]>('offline-charities.json'),
    loadOfflineDataFile<OfflineServiceFile['records'][number]>('offline-emergency-services.json'),
    loadOfflineDataFile<PostcodesFile['records'][number]>('postcodes.json'),
    loadOfflineDataFile<LocalityRecord>('localities.json'),
  ])
  return {
    wifi,
    charities,
    emergencyServices,
    postcodes,
    localities,
    dataVersion: joinDataVersions({
      'offline-wifi.json': wifi.dataVersion,
      'offline-charities.json': charities.dataVersion,
      'offline-emergency-services.json': emergencyServices.dataVersion,
      'postcodes.json': postcodes.dataVersion,
      'localities.json': localities.dataVersion,
    }),
  }
}

/** Localities that list this postcode, by name. Null when localities.json cannot be loaded. */
export async function lookupLocalities(postcode: string): Promise<LocalityRecord[] | null> {
  try {
    const file = await loadOfflineDataFile<LocalityRecord>('localities.json')
    return file.records
      .filter((record) => Array.isArray(record.postcodes) && record.postcodes.includes(postcode))
      .sort((left, right) => left.name.localeCompare(right.name, 'en-AU'))
  } catch {
    return null
  }
}
