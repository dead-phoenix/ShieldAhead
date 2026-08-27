import type { DatasetMetadata } from '../contracts'
import type {
  SupportServiceRepository,
  WifiRepository,
} from '../repositories'

const prototypeMetadata: DatasetMetadata = {
  version: 'prototype-empty-v1',
  generatedAt: '2026-08-27T00:00:00.000Z',
  sourceName: 'Frontend prototype — no verified dataset',
  coverageAreas: [],
  limitations: [
    'No real service or Wi-Fi records are included.',
    'This adapter exists only to verify the frontend data boundary.',
  ],
}

export const mockWifiRepository: WifiRepository = {
  async list() {
    return { records: [], metadata: prototypeMetadata }
  },
}

export const mockSupportServiceRepository: SupportServiceRepository = {
  async list() {
    return { records: [], metadata: prototypeMetadata }
  },
}
