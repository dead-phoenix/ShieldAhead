import { haversineKm, type LatLng } from '../../shared/utils/geo'
import type { DatasetResult, MyArea, SupportService } from '../contracts'
import type { LocalityRecord, OfflineServiceRecord, PostcodeRecord } from '../offlineData'
import { isInRegion } from './nearbySnapshot'
import { loadOfflineDataFile } from './offlineDataLoader'

export const STATIC_SUPPORT_LIMITATIONS = [
  'Approximate locations from the offline charity list. Street addresses are not included.',
  'Distances are measured from the centre of My area.',
]

/** Maps one offline-charities.json record to the shape the API returns. The ids
 * match the API's (both are acnc-<ABN>), so saved and live copies line up. */
export function supportServiceFromOfflineCharity(
  record: OfflineServiceRecord,
  dataUpdatedAt: string,
  origin: LatLng,
): SupportService {
  return {
    id: record.id,
    name: record.name,
    serviceTypes: record.serviceTypes.length > 0 ? record.serviceTypes : ['Community support services'],
    address: undefined,
    suburb: record.suburb ?? 'Area not confirmed',
    postcode: record.postcode ?? '',
    latitude: record.lat,
    longitude: record.lng,
    distanceKm: Math.round(haversineKm(origin, record) * 10) / 10,
    phone: record.phone ?? undefined,
    website: record.website ?? undefined,
    partnerStatus: 'unknown',
    availabilityStatus: 'not-confirmed',
    dataUpdatedAt,
  }
}

function areaPoint(
  area: Pick<MyArea, 'postcode' | 'localityId'>,
  localities: LocalityRecord[],
  postcodes: PostcodeRecord[],
): LatLng | null {
  const locality = area.localityId ? localities.find((record) => record.id === area.localityId) : undefined
  if (locality) return { lat: locality.lat, lng: locality.lng }
  const postcode = postcodes.find((record) => record.postcode === area.postcode)
  return postcode ? { lat: postcode.lat, lng: postcode.lng } : null
}

/** The nearest charities to My area from the bundled offline list, or null when
 * My area is outside the offline region (or the files cannot be read). */
export async function buildStaticSupportDataset(
  area: Pick<MyArea, 'postcode' | 'localityId'>,
  limit: number,
): Promise<DatasetResult<SupportService> | null> {
  try {
    const [charities, postcodes, localities] = await Promise.all([
      loadOfflineDataFile<OfflineServiceRecord>('offline-charities.json'),
      loadOfflineDataFile<PostcodeRecord>('postcodes.json'),
      loadOfflineDataFile<LocalityRecord>('localities.json'),
    ])
    const origin = areaPoint(area, localities.records, postcodes.records)
    if (!origin || !isInRegion(origin, charities.region)) return null
    const records = charities.records
      .filter((record) => record.category === 'charity')
      .map((record) => supportServiceFromOfflineCharity(record, charities.generatedAt, origin))
      .sort((left, right) => (left.distanceKm ?? Infinity) - (right.distanceKm ?? Infinity))
      .slice(0, limit)
    return {
      records,
      metadata: {
        version: charities.dataVersion,
        generatedAt: charities.generatedAt,
        sourceName: 'ACNC Registered Charities Register (offline copy)',
        coverageAreas: [charities.region.name],
        limitations: STATIC_SUPPORT_LIMITATIONS,
      },
    }
  } catch {
    return null
  }
}
