import type {
  DatasetResult,
  SupportService,
  WifiLocation,
} from './contracts'

export interface WifiRepository {
  list(): Promise<DatasetResult<WifiLocation>>
}

export interface SupportServiceRepository {
  list(): Promise<DatasetResult<SupportService>>
}
