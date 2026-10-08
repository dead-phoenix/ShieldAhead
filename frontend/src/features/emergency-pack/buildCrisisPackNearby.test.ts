import { describe, expect, it } from 'vitest'
import type { MyArea } from '../../data/contracts'
import { buildNearbySnapshot } from '../../data/offline/nearbySnapshot'
import { fixtureBundle } from '../../test/nearbyFixtures'
import { buildCrisisPack, type CrisisPackNearbyPage } from './buildCrisisPack'
import { emptyEmergencyPackSnapshot, type EmergencyPackPreferences } from './emergencyPackStorage'

const preferences: EmergencyPackPreferences = {
  includeHelplines: true,
  includeWifi: false,
  includeCharities: false,
  crises: ['flood'],
}

const harcourt: MyArea = { postcode: '3453', localityId: 'loc-harcourt', localityName: 'Harcourt', label: 'Harcourt 3453', savedAt: '' }
const bendigo: MyArea = { postcode: '3550', localityId: 'loc-bendigo', localityName: 'Bendigo', label: 'Bendigo 3550', savedAt: '' }

function build(nearby?: Parameters<typeof buildCrisisPack>[0]['nearby']) {
  return buildCrisisPack({ preferences, snapshot: emptyEmergencyPackSnapshot(), nearby })
}

describe('crisis pack nearby services page', () => {
  it('is left out when there is no saved snapshot', () => {
    expect(build().pages.map((page) => page.kind)).toEqual(['get-help', 'checklist', 'contacts'])
    expect(build({ snapshot: null, myArea: harcourt }).pages.map((page) => page.kind)).toEqual(['get-help', 'checklist', 'contacts'])
  })

  it('is left out when My area is outside the region', () => {
    const snapshot = buildNearbySnapshot({ postcode: '3000', label: '3000', savedAt: '' }, fixtureBundle())
    expect(build({ snapshot, myArea: null }).pages.some((page) => page.kind === 'nearby')).toBe(false)
  })

  it('follows the get-help page and uses the same wording as /nearby', () => {
    const snapshot = buildNearbySnapshot(harcourt, fixtureBundle(), '2026-10-08T06:00:00.000Z')
    const pack = build({ snapshot, myArea: harcourt })
    const page = pack.pages[1] as CrisisPackNearbyPage

    expect(pack.pages.map((item) => item.kind)).toEqual(['get-help', 'nearby', 'checklist', 'contacts'])
    expect(pack.summary).toBe('Preview: 4 pages. Get help, Nearby services, Flood checklist, My emergency contacts.')
    expect(page.title).toBe('Saved nearby services')
    expect(page.emergencyLine).toBe('In an emergency call 000.')
    expect(page.areaHeading).toBe('Near Harcourt 3453')
    expect(page.staleNotice).toBeUndefined()
    expect(page.groups.map((group) => group.title)).toEqual(['Hospitals', 'Police stations', 'Fire stations', 'Ambulance stations'])
    expect(page.groups[2].places[0]).toMatchObject({ name: 'Harcourt Fire Station', detail: 'Harcourt 3453 · 0.4 km' })
    expect(page.freshnessNote).toMatch(/^Saved on 8 October 2026\./)
  })

  it('warns when the saved list is for a different area than My area', () => {
    const snapshot = buildNearbySnapshot(harcourt, fixtureBundle())
    const page = build({ snapshot, myArea: bendigo }).pages[1] as CrisisPackNearbyPage

    expect(page.areaHeading).toBe('Saved list for Harcourt 3453')
    expect(page.staleNotice).toBe('This list is for Harcourt 3453, not Bendigo 3550. Update saved information when you are online.')
  })
})
