import { describe, expect, it } from 'vitest'
import type { SupportService, WifiLocation } from '../../data/contracts'
import { supportMapRecords, wifiMapRecords } from './mapRecords'

describe('map record adapters', () => {
  it('keeps Wi-Fi records with valid coordinates only', () => {
    const locations = [
      { id: 'mapped', name: 'Mapped Wi-Fi', suburb: 'Melbourne', postcode: '3000', latitude: -37.81, longitude: 144.96, dataUpdatedAt: '2026-09-01' },
      { id: 'missing', name: 'List only', suburb: 'Melbourne', postcode: '3000', dataUpdatedAt: '2026-09-01' },
      { id: 'invalid', name: 'Invalid', suburb: 'Melbourne', postcode: '3000', latitude: 120, longitude: 144.96, dataUpdatedAt: '2026-09-01' },
    ] satisfies WifiLocation[]

    expect(wifiMapRecords(locations)).toEqual([
      { id: 'mapped', kind: 'wifi', name: 'Mapped Wi-Fi', latitude: -37.81, longitude: 144.96, markerLabel: 'Wi-Fi', status: undefined, previewStatus: 'Wi-Fi availability not confirmed', previewLines: ['Melbourne VIC 3000', 'Opening hours not confirmed'] },
    ])
  })

  it('keeps support records with valid coordinates only', () => {
    const services = [
      { id: 'mapped', name: 'Mapped service', serviceTypes: ['Food'], suburb: 'Melbourne', postcode: '3000', latitude: -37.82, longitude: 144.97, availabilityStatus: 'not-confirmed', dataUpdatedAt: '2026-09-01' },
      { id: 'missing', name: 'List only', serviceTypes: ['Food'], suburb: 'Melbourne', postcode: '3000', availabilityStatus: 'not-confirmed', dataUpdatedAt: '2026-09-01' },
    ] satisfies SupportService[]

    expect(supportMapRecords(services)).toEqual([
      { id: 'mapped', kind: 'support', name: 'Mapped service', latitude: -37.82, longitude: 144.97, markerLabel: 'Support', previewStatus: 'Support service', previewLines: ['Melbourne VIC 3000', 'Phone not published'] },
    ])
  })
})
