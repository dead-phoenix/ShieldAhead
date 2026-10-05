import { describe, expect, it, vi } from 'vitest'
import { bundledChecklistGroups } from '../crisis/useCrisisApiContent'
import { buildCrisisPack, type CrisisPackChecklistPage, type CrisisPackGetHelpPage } from './buildCrisisPack'
import { crisisGuidelines } from './emergencyPackContent'
import { emptyEmergencyPackSnapshot, type EmergencyPackPreferences, type EmergencyPackSnapshot } from './emergencyPackStorage'

vi.mock('./crisisPackSources', () => ({
  crisisPackSources: {
    bushfire: [{ label: '', url: '' }],
    flood: [
      { label: 'Example flood source', url: 'https://example.org/flood' },
      { label: '', url: '' },
    ],
    'power-outage': [],
  },
}))

const downloadedAt = new Date(2026, 9, 5, 12)

const allOff: EmergencyPackPreferences = {
  includeHelplines: false,
  includeWifi: false,
  includeCharities: false,
  crises: [],
}

function place(id: string) {
  return { id, name: `Place ${id}`, address: `${id} Main Street`, suburb: 'Harcourt', postcode: '3453' }
}

function snapshot(overrides: Partial<EmergencyPackSnapshot> = {}): EmergencyPackSnapshot {
  return {
    ...emptyEmergencyPackSnapshot(),
    savedAt: '2026-10-05T00:00:00.000Z',
    placesSavedAt: { wifi: '2026-10-05T00:00:00.000Z', support: '2026-10-05T00:00:00.000Z' },
    helplines: [
      { id: 'flood-triple-zero', name: 'Triple Zero (000)', phone: '000' },
      { id: 'bushfire-vicemergency-hotline', name: 'VicEmergency Hotline', phone: '1800 226 226' },
      { id: 'flood-vicses-emergency-line', name: 'VICSES Flood and Storm Emergency Line', phone: '132 500' },
    ],
    ...overrides,
  }
}

describe('buildCrisisPack', () => {
  it('renders only the contacts page when every toggle is off', () => {
    const pack = buildCrisisPack({ preferences: allOff, snapshot: snapshot(), downloadedAt })
    expect(pack.pages.map((page) => page.kind)).toEqual(['contacts'])
    expect(pack).toMatchSnapshot()
  })

  it('pins Triple Zero and VICSES first and drops data helplines with the same phone', () => {
    const pack = buildCrisisPack({ preferences: { ...allOff, includeHelplines: true }, snapshot: snapshot(), downloadedAt })
    const getHelp = pack.pages[0] as CrisisPackGetHelpPage
    expect(getHelp.helplines?.map((helpline) => helpline.phone)).toEqual(['000', '132 500', '1800 226 226'])
    expect(getHelp.helplines?.[0].note).toBe('For life-threatening danger')
    expect(getHelp.placeColumns).toEqual([])
    expect(getHelp.freshnessNote).toBeUndefined()
    expect(pack).toMatchSnapshot()
  })

  it('renders the flood checklist exactly as the crisis page groups it, with only filled-in sources', () => {
    const pack = buildCrisisPack({ preferences: { ...allOff, crises: ['flood'] }, snapshot: snapshot(), downloadedAt })
    const flood = pack.pages[0] as CrisisPackChecklistPage
    expect(pack.pages.map((page) => page.id)).toEqual(['checklist-flood', 'contacts'])
    expect(flood.title).toBe('Flood Household Checklist')
    expect(flood.groups).toEqual(bundledChecklistGroups('flood').map((group) => ({
      id: group.id,
      title: group.title,
      tasks: group.items.map((item) => ({ id: `${group.id}.${item.id}`, title: item.label, description: item.description })),
    })))
    expect(flood.sources).toEqual([{ label: 'Example flood source', url: 'https://example.org/flood' }])
    expect(pack).toMatchSnapshot()
  })

  it("puts the dos and don'ts on the checklist page", () => {
    const pack = buildCrisisPack({ preferences: { ...allOff, crises: ['flood'] }, snapshot: snapshot(), downloadedAt })
    const { guidelines } = pack.pages[0] as CrisisPackChecklistPage
    expect(guidelines.dos).toEqual(crisisGuidelines.flood.dos)
    expect(guidelines.donts).toContain('Never walk, ride, or drive through floodwater.')
  })

  it('orders all three checklists bushfire, flood, power outage and numbers every page', () => {
    const pack = buildCrisisPack({
      preferences: { ...allOff, crises: ['power-outage', 'bushfire', 'flood'] },
      snapshot: snapshot(),
      downloadedAt,
    })
    expect(pack.pages.map((page) => `${page.id} ${page.pageNumber} of ${page.totalPages}`)).toEqual([
      'checklist-bushfire 1 of 4',
      'checklist-flood 2 of 4',
      'checklist-power-outage 3 of 4',
      'contacts 4 of 4',
    ])
    expect((pack.pages[0] as CrisisPackChecklistPage).sources).toEqual([])
    expect(pack).toMatchSnapshot()
  })

  it('renders only the places that exist when fewer than 5 are available', () => {
    const pack = buildCrisisPack({
      preferences: { ...allOff, includeWifi: true, includeCharities: true },
      snapshot: snapshot({ wifi: [place('w1'), place('w2')], support: [place('s1')] }),
      downloadedAt,
    })
    const getHelp = pack.pages[0] as CrisisPackGetHelpPage
    expect(getHelp.helplines).toBeUndefined()
    expect(getHelp.placeColumns.map((column) => column.places.length)).toEqual([2, 1])
    expect(getHelp.freshnessNote).toBe('Details were correct when this pack was downloaded on 5 October 2026. Check before relying on them.')
    expect(pack).toMatchSnapshot()
  })

  it('caps each place list at 5', () => {
    const pack = buildCrisisPack({
      preferences: { ...allOff, includeWifi: true },
      snapshot: snapshot({ wifi: ['1', '2', '3', '4', '5', '6'].map(place) }),
      downloadedAt,
    })
    expect((pack.pages[0] as CrisisPackGetHelpPage).placeColumns[0].places).toHaveLength(5)
  })

  it('cleans names and addresses, dedupes, and prints name only when there is no address', () => {
    const pack = buildCrisisPack({
      preferences: { ...allOff, includeWifi: true },
      snapshot: snapshot({
        wifi: [
          { id: 'a', name: 'LIBRARY AT THE DOCK', address: 'Se 1220 401 Docklands Dr, Docklands, VIC, 3008', suburb: 'Docklands', postcode: '3008' },
          { id: 'b', name: 'LIBRARY AT THE DOCK', address: '401 Docklands Dr', suburb: 'Docklands', postcode: '3008' },
          { id: 'c', name: 'Pop-up hotspot', suburb: 'Area not confirmed', postcode: '' },
        ],
      }),
      downloadedAt,
    })
    expect((pack.pages[0] as CrisisPackGetHelpPage).placeColumns[0].places).toEqual([
      { id: 'a', name: 'Library at the Dock', detail: '401 Docklands Dr, Docklands VIC 3008' },
      { id: 'c', name: 'Pop-up hotspot' },
    ])
  })

  it('adds a "Near" area line when places are included and the saved area names a suburb', () => {
    const pack = buildCrisisPack({
      preferences: { ...allOff, includeCharities: true },
      snapshot: snapshot({ areaLabel: 'Harcourt 3453', postcode: '3453' }),
      downloadedAt,
    })
    const getHelp = pack.pages[0] as CrisisPackGetHelpPage
    expect(getHelp.areaLine).toBe('Near Harcourt 3453')
    expect(getHelp.placeColumns[0].title).toBe('Charities near you')
  })

  it('omits the area line when there is no location, only a postcode, or no places', () => {
    const areaLineFor = (overrides: Partial<EmergencyPackSnapshot>, preferences = { ...allOff, includeWifi: true }) =>
      (buildCrisisPack({ preferences, snapshot: snapshot(overrides), downloadedAt }).pages[0] as CrisisPackGetHelpPage).areaLine
    expect(areaLineFor({ areaLabel: '', postcode: '' })).toBeUndefined()
    expect(areaLineFor({ areaLabel: '3453', postcode: '3453' })).toBeUndefined()
    expect(areaLineFor({ areaLabel: 'Harcourt 3453', postcode: '3453' }, { ...allOff, includeHelplines: true })).toBeUndefined()
  })

  it('marks a place column as not available offline when it was never loaded', () => {
    const pack = buildCrisisPack({
      preferences: { ...allOff, includeWifi: true, includeCharities: true },
      snapshot: snapshot({ placesSavedAt: {} }),
      downloadedAt,
    })
    const columns = (pack.pages[0] as CrisisPackGetHelpPage).placeColumns
    expect(columns.map((column) => column.message)).toEqual(['Not available offline', 'Not available offline'])
  })

  it('prints the saved checklist from the API when there is one', () => {
    const pack = buildCrisisPack({
      preferences: { ...allOff, crises: ['bushfire'] },
      snapshot: snapshot({
        checklists: { bushfire: [{ id: 'new-group', title: 'New', items: [{ id: 'new-item', task: 'A brand new task' }] }] },
      }),
      downloadedAt,
    })
    expect((pack.pages[0] as CrisisPackChecklistPage).groups).toEqual([
      { id: 'new-group', title: 'New', tasks: [{ id: 'new-group.new-item', title: 'A brand new task' }] },
    ])
  })
})
