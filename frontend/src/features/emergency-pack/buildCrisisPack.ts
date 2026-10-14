import type { MyArea } from '../../data/contracts'
import { snapshotMatchesArea, type NearbySnapshot } from '../../data/offline/nearbySnapshot'
import type { OfflineServiceCategory } from '../../data/offlineData'
import { householdChecklistTitles, pinnedHelplines, type CrisisKind } from '../crisis/crisisContent'
import { formatDistanceKm, formatNearbyDate, nearbyCategoryTitles, nearbyCopy, serviceDetail } from '../nearby/nearbyCopy'
import { readCrisisChecklist } from '../crisis/crisisChecklistStorage'
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

export interface CrisisPackTaskStep {
  id: string
  label: string
  done: boolean
}

export interface CrisisPackTask {
  id: string
  title: string
  description?: string
  done: boolean
  steps: CrisisPackTaskStep[]
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

export interface CrisisPackNearbyGroup {
  id: OfflineServiceCategory
  title: string
  places: CrisisPackPlace[]
  /** Shown instead of the list when nothing is saved for this category. */
  message?: string
}

export interface CrisisPackNearbyPage extends CrisisPackPageBase {
  kind: 'nearby'
  title: string
  emergencyLine: string
  areaHeading: string
  /** Set when the saved list is for a different area than My area. */
  staleNotice?: string
  groups: CrisisPackNearbyGroup[]
  freshnessNote?: string
}

export type CrisisPackPage = CrisisPackGetHelpPage | CrisisPackNearbyPage | CrisisPackChecklistPage | CrisisPackContactsPage

export interface CrisisPack {
  pages: CrisisPackPage[]
  summary: string
  /** "Built for <area> · Saved <date>", printed in every page footer. */
  builtForLine: string
}

export interface BuildCrisisPackInput {
  preferences: EmergencyPackPreferences
  snapshot: EmergencyPackSnapshot
  /** The saved nearby services; the nearby page is left out when there is none. */
  nearby?: { snapshot: NearbySnapshot | null; myArea: MyArea | null }
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

const PACK_NEARBY_CATEGORIES: readonly OfflineServiceCategory[] = ['hospital', 'police', 'fire', 'ambulance']
const PACK_NEARBY_PER_CATEGORY = 3

function nearbyPage(nearby: BuildCrisisPackInput['nearby']): UnnumberedPage | null {
  const snapshot = nearby?.snapshot
  if (!snapshot || !snapshot.originInRegion) return null
  const myArea = nearby?.myArea ?? null
  const isStale = Boolean(myArea && !snapshotMatchesArea(snapshot, myArea))
  const savedOn = formatNearbyDate(snapshot.builtAt)

  return {
    kind: 'nearby',
    id: 'nearby',
    label: 'Nearby services',
    title: nearbyCopy.pageTitle,
    emergencyLine: nearbyCopy.emergency,
    areaHeading: isStale ? nearbyCopy.staleListHeading(snapshot.originLabel) : nearbyCopy.savedListHeading(snapshot.originLabel),
    ...(isStale && myArea ? { staleNotice: nearbyCopy.staleArea(snapshot.originLabel, myArea.label) } : {}),
    groups: PACK_NEARBY_CATEGORIES.map((category) => {
      const places = (snapshot.nearest[category] ?? []).slice(0, PACK_NEARBY_PER_CATEGORY).map((record) => {
        const detail = [serviceDetail(record), formatDistanceKm(record.distanceKm)].filter(Boolean).join(' · ')
        return { id: record.id, name: clampPlaceText(record.name), detail: clampPlaceText(detail) }
      })
      return places.length > 0
        ? { id: category, title: nearbyCategoryTitles[category], places }
        : { id: category, title: nearbyCategoryTitles[category], places: [], message: nearbyCopy.noneInCategory }
    }),
    ...(savedOn ? { freshnessNote: nearbyCopy.savedOn(savedOn) } : {}),
  }
}

function checklistPage(kind: CrisisKind, label: string, snapshot: EmergencyPackSnapshot): UnnumberedPage {
  const groups = snapshot.checklists[kind]?.length ? snapshot.checklists[kind] : bundledPackChecklist(kind)
  const checked = readCrisisChecklist(kind)
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
      tasks: group.items.map((item) => {
        const steps = (item.steps ?? []).map((step, index) => ({
          id: `${group.id}.${item.id}.step-${index}`,
          label: step,
          done: Boolean(checked[`${group.id}.${item.id}.step-${index}`]),
        }))
        return {
          id: `${group.id}.${item.id}`,
          title: item.task,
          ...(steps.length === 0 && item.description?.trim() ? { description: item.description } : {}),
          done: steps.length > 0 && steps.every((step) => step.done),
          steps,
        }
      }),
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
    nearbyPage(input.nearby),
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
