import { householdChecklistTitles, pinnedHelplines, type CrisisKind } from '../crisis/crisisContent'
import { clampPlaceText, distinctPlaces, packDisplayName, packPlaceAddress } from './crisisPackPlaceText'
import { bundledPackChecklist } from './crisisPackSnapshot'
import { crisisPackSources, type CrisisPackSource } from './crisisPackSources'
import { HANDWRITTEN_CONTACT_ROWS, NEARBY_PLACE_LIMIT, crisisGuidelines, crisisPackOptions } from './emergencyPackContent'
import type { EmergencyPackPreferences, EmergencyPackSnapshot, PackPlace } from './emergencyPackStorage'

export const CRISIS_PACK_FOOTER_LABEL = 'ShieldAhead'
export const CRISIS_PACK_DOCUMENT_TITLE = 'Crisis pack'

export interface CrisisPackHelpline {
  id: string
  name: string
  phone: string
  note?: string
}

export interface CrisisPackPlace {
  id: string
  name: string
  /** Omitted when the place has no confirmed address or suburb. */
  detail?: string
}

export interface CrisisPackPlaceColumn {
  id: 'wifi' | 'charities'
  title: string
  places: CrisisPackPlace[]
  /** Shown instead of the list when there are no places to print. */
  message?: string
}

export interface CrisisPackTask {
  id: string
  title: string
  description?: string
}

export interface CrisisPackTaskGroup {
  id: string
  title: string
  tasks: CrisisPackTask[]
}

interface CrisisPackPageBase {
  id: string
  /** Short name used in the accessible preview summary. */
  label: string
  pageNumber: number
  totalPages: number
}

export interface CrisisPackGetHelpPage extends CrisisPackPageBase {
  kind: 'get-help'
  title: string
  /** "Near <Suburb> <postcode>", only when places are included and the saved area names a suburb. */
  areaLine?: string
  nameAndDateLabel: string
  helplinesTitle: string
  helplines?: CrisisPackHelpline[]
  placeColumns: CrisisPackPlaceColumn[]
  freshnessNote?: string
}

export interface CrisisPackChecklistPage extends CrisisPackPageBase {
  kind: 'checklist'
  crisis: CrisisKind
  title: string
  subtitle: string
  groups: CrisisPackTaskGroup[]
  guidelines: CrisisPackGuidelines
  sourcesTitle: string
  sources: CrisisPackSource[]
}

export interface CrisisPackGuidelines {
  dosTitle: string
  dos: string[]
  dontsTitle: string
  donts: string[]
}

export interface CrisisPackContactsPage extends CrisisPackPageBase {
  kind: 'contacts'
  title: string
  rowCount: number
  columns: string[]
  meetingPlaceLabel: string
  outsideContactLabel: string
}

export type CrisisPackPage = CrisisPackGetHelpPage | CrisisPackChecklistPage | CrisisPackContactsPage

export interface CrisisPack {
  pages: CrisisPackPage[]
  summary: string
  /** "Built for <area> · Saved <date>", printed in every page footer. */
  builtForLine: string
}

export interface BuildCrisisPackInput {
  preferences: EmergencyPackPreferences
  snapshot: EmergencyPackSnapshot
}

type UnnumberedPage = CrisisPackPage extends infer Page
  ? Page extends CrisisPackPage ? Omit<Page, 'pageNumber' | 'totalPages'> : never
  : never

function phoneKey(phone: string): string {
  return phone.replace(/\D/g, '')
}

function formatPackDate(value: string | undefined): string | undefined {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : new Intl.DateTimeFormat('en-AU', { dateStyle: 'long' }).format(date)
}

function builtForLine(snapshot: EmergencyPackSnapshot): string {
  const area = snapshot.areaLabel.trim() || snapshot.postcode.trim()
  const savedOn = formatPackDate(snapshot.savedAt)
  return [
    area ? `Built for ${area}` : 'Area not set',
    savedOn ? `Saved ${savedOn}` : 'Not saved yet',
  ].join(' · ')
}

function freshnessNote(snapshot: EmergencyPackSnapshot): string {
  const savedOn = formatPackDate(snapshot.savedAt)
  return savedOn
    ? `Details were correct when this pack was saved on ${savedOn}. Check before relying on them.`
    : 'This pack has not been saved on this device yet. Check details before relying on them.'
}

function packHelplines(snapshot: EmergencyPackSnapshot): CrisisPackHelpline[] {
  const seen = new Set(pinnedHelplines.map((helpline) => phoneKey(helpline.phone)))
  const fromData = snapshot.helplines.filter((helpline) => {
    const key = phoneKey(helpline.phone)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
  return [
    ...pinnedHelplines.map(({ id, name, phone, note }) => ({ id, name, phone, note })),
    ...fromData.map(({ id, name, phone }) => ({ id, name, phone })),
  ]
}

function toCrisisPackPlace(place: PackPlace): CrisisPackPlace {
  const detail = packPlaceAddress(place)
  return {
    id: place.id,
    name: clampPlaceText(packDisplayName(place.name)),
    ...(detail ? { detail: clampPlaceText(detail) } : {}),
  }
}

function placeColumn(
  id: CrisisPackPlaceColumn['id'],
  title: string,
  places: PackPlace[],
  savedAt: string | undefined,
): CrisisPackPlaceColumn {
  if (!savedAt) return { id, title, places: [], message: 'Not available offline' }
  const limited = distinctPlaces(places).slice(0, NEARBY_PLACE_LIMIT).map(toCrisisPackPlace)
  return limited.length > 0
    ? { id, title, places: limited }
    : { id, title, places: [], message: 'None listed near this area' }
}

function areaLine(snapshot: EmergencyPackSnapshot): string | undefined {
  const postcode = snapshot.postcode.trim()
  const label = snapshot.areaLabel.trim()
  const suburb = postcode && label.endsWith(postcode) ? label.slice(0, -postcode.length).trim() : label
  if (!postcode || !suburb || /^\d{4}$/.test(suburb)) return undefined
  return `Near ${suburb} ${postcode}`
}

function getHelpPage(input: BuildCrisisPackInput): UnnumberedPage | null {
  const { preferences, snapshot } = input
  if (!preferences.includeHelplines && !preferences.includeWifi && !preferences.includeCharities) return null

  const placeColumns: CrisisPackPlaceColumn[] = []
  if (preferences.includeWifi) {
    placeColumns.push(placeColumn('wifi', 'Wi-Fi spots', snapshot.wifi, snapshot.placesSavedAt.wifi))
  }
  if (preferences.includeCharities) {
    placeColumns.push(placeColumn('charities', 'Charities near you', snapshot.support, snapshot.placesSavedAt.support))
  }

  return {
    kind: 'get-help',
    id: 'get-help',
    label: 'Get help',
    title: 'Your crisis pack',
    ...(placeColumns.length > 0 && areaLine(snapshot) ? { areaLine: areaLine(snapshot) } : {}),
    nameAndDateLabel: 'Name and date',
    helplinesTitle: 'Helplines',
    helplines: preferences.includeHelplines ? packHelplines(snapshot) : undefined,
    placeColumns,
    freshnessNote: placeColumns.length > 0 ? freshnessNote(snapshot) : undefined,
  }
}

function checklistPage(kind: CrisisKind, label: string, snapshot: EmergencyPackSnapshot): UnnumberedPage {
  const groups = snapshot.checklists[kind]?.length ? snapshot.checklists[kind] : bundledPackChecklist(kind)
  return {
    kind: 'checklist',
    id: `checklist-${kind}`,
    label: `${label} checklist`,
    crisis: kind,
    title: householdChecklistTitles[kind],
    subtitle: 'Tick each one when it is done',
    groups: groups.map((group) => ({
      id: group.id,
      title: group.title,
      tasks: group.items.map((item) => ({
        id: `${group.id}.${item.id}`,
        title: item.task,
        ...(item.description?.trim() ? { description: item.description } : {}),
      })),
    })),
    guidelines: {
      dosTitle: 'What to do',
      dos: crisisGuidelines[kind].dos,
      dontsTitle: 'What not to do',
      donts: crisisGuidelines[kind].donts,
    },
    sourcesTitle: 'Sources',
    sources: crisisPackSources[kind].filter((source) => source.label.trim() && source.url.trim()),
  }
}

function contactsPage(): UnnumberedPage {
  return {
    kind: 'contacts',
    id: 'contacts',
    label: 'My emergency contacts',
    title: 'My emergency contacts',
    rowCount: HANDWRITTEN_CONTACT_ROWS,
    columns: ['Name', 'Phone', 'Notes'],
    meetingPlaceLabel: 'Meeting place',
    outsideContactLabel: 'Contact outside the area',
  }
}

export function buildCrisisPack(input: BuildCrisisPackInput): CrisisPack {
  const unnumbered: UnnumberedPage[] = [
    getHelpPage(input),
    ...crisisPackOptions
      .filter((option) => input.preferences.crises.includes(option.kind))
      .map((option) => checklistPage(option.kind, option.label, input.snapshot)),
    contactsPage(),
  ].filter((page): page is UnnumberedPage => page !== null)

  const totalPages = unnumbered.length
  const pages = unnumbered.map((page, index) => ({ ...page, pageNumber: index + 1, totalPages }) as CrisisPackPage)
  const pageWord = totalPages === 1 ? 'page' : 'pages'

  return {
    pages,
    summary: `Preview: ${totalPages} ${pageWord}. ${pages.map((page) => page.label).join(', ')}.`,
    builtForLine: builtForLine(input.snapshot),
  }
}
