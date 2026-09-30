import { describe, expect, it } from 'vitest'
import type { DatasetMetadata } from '../../../data/contracts'
import type { SupportServiceRepository, WifiRepository } from '../../../data/repositories'
import { createCombinedMapPlaceRepository } from './mapPlaceRepository'

const metadata: DatasetMetadata = {
  version: '1',
  generatedAt: '2026-09-20T00:00:00.000Z',
  sourceName: 'Test source',
  coverageAreas: ['3550'],
  limitations: ['Test limitation'],
}

describe('combined map place repository', () => {
  it('combines Wi-Fi and support records without id collisions', async () => {
    const wifiRepository: WifiRepository = {
      async list() {
        return {
          metadata,
          records: [{
            id: 'same-id',
            name: 'Wi-Fi',
            suburb: 'Bendigo',
            postcode: '3550',
            dataUpdatedAt: '2026-09-20T00:00:00.000Z',
          }],
        }
      },
    }
    const supportRepository: SupportServiceRepository = {
      async list() {
        return {
          metadata: { ...metadata, dataOrigin: 'cache' },
          records: [{
            id: 'same-id',
            name: 'Support',
            serviceTypes: ['Community support services'],
            suburb: 'Bendigo',
            postcode: '3550',
            availabilityStatus: 'not-confirmed',
            dataUpdatedAt: '2026-09-20T00:00:00.000Z',
          }],
        }
      },
    }

    const result = await createCombinedMapPlaceRepository({
      wifiRepository,
      supportRepository,
    }).findNearby({ postcode: '3550' })

    expect(result.places.map(({ id }) => id)).toEqual([
      'wifi:same-id',
      'support:same-id',
    ])
    expect(result.dataOrigin).toBe('mixed')
    expect(result.datasets).toHaveLength(2)
  })

  it('returns one source with a plain-language error when the other fails', async () => {
    const wifiRepository: WifiRepository = {
      async list() {
        throw new Error('Wi-Fi is unavailable.')
      },
    }
    const supportRepository: SupportServiceRepository = {
      async list() {
        return { metadata, records: [] }
      },
    }

    const result = await createCombinedMapPlaceRepository({
      wifiRepository,
      supportRepository,
    }).findNearby({ postcode: '3550' })

    expect(result.places).toEqual([])
    expect(result.sourceErrors).toEqual([
      { source: 'wifi', message: 'Wi-Fi is unavailable.' },
    ])
  })

  it('fails only when every configured source fails', async () => {
    const wifiRepository: WifiRepository = {
      async list() {
        throw new Error('Wi-Fi is unavailable.')
      },
    }
    const supportRepository: SupportServiceRepository = {
      async list() {
        throw new Error('Support is unavailable.')
      },
    }

    await expect(createCombinedMapPlaceRepository({
      wifiRepository,
      supportRepository,
    }).findNearby({ postcode: '3550' })).rejects.toThrow(
      'Wi-Fi is unavailable. Support is unavailable.',
    )
  })
})

