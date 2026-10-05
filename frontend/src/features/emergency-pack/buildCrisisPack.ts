import { pinnedHelplines, type CrisisKind } from '../crisis/crisisContent'
import { crisisPackChecklistTitles } from './crisisPackChecklistTitles'
import { bundledPackChecklist } from './crisisPackSnapshot'
import { crisisPackSources, type CrisisPackSource } from './crisisPackSources'
import { HANDWRITTEN_CONTACT_ROWS, NEARBY_PLACE_LIMIT, crisisPackOptions } from './emergencyPackContent'
import type { EmergencyPackPreferences, EmergencyPackSnapshot, PackPlace } from './emergencyPackStorage'

export const CRISIS_PACK_FOOTER_LABEL = 'ShieldAhead'
export const CRISIS_PACK_DOCUMENT_TITLE = 'Crisis pack'

export interface CrisisPackHelpline {
  id: string
  name: string
  phone: string
  note?: string
}

export interface CrisisPackPlaceColumn {
  id: 'wifi' | 'charities'
  title: string
  places: PackPlace[]
  /** Shown instead of the list when there are no places to print. */
  message?: string
}

export interface CrisisPackTask {
  id: string
  title: string
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
  nameAndDateLabel: string
  helplines?: CrisisPackHelpline[]
  placeColumns: CrisisPackPlaceColumn[]
  freshnessNote?: string
}

export interface CrisisPackChecklistPage extends CrisisPackPageBase {
  kind: 'checklist'
  crisis: CrisisKind
  title: string
  subtitle: string
  tasks: CrisisPackTask[]
  sources: CrisisPackSource[]
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
}

export interface BuildCrisisPackInput {
  preferences: EmergencyPackPreferences
  snapshot: EmergencyPackSnapshot
  downloadedAt: Date
}

type UnnumberedPage = CrisisPackPage extends infer Page
  ? Page extends CrisisPackPage ? Omit<Page, 'pageNumber' | 'totalPages'> : never
  : never

function phoneKey(phone: string): string {
  return phone.replace(/\D/g, '')
}

function formatDownloadDate(date: Date): string {
  return new Intl.DateTimeFormat('en-AU', { dateStyle: 'long' }).format(date)
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

function placeColumn(
  id: CrisisPackPlaceColumn['id'],
  title: string,
  places: PackPlace[],
  savedAt: string | undefined,
): CrisisPackPlaceColumn {
  if (!savedAt) return { id, title, places: [], message: 'Not available offline' }
  const limited = places.slice(0, NEARBY_PLACE_LIMIT)
  return limited.length > 0
    ? { id, title, places: limited }
    : { id, title, places: [], message: 'None listed near this area' }
}

function getHelpPage(input: BuildCrisisPackInput): UnnumberedPage | null {
  const { preferences, snapshot, downloadedAt } = input
  if (!preferences.includeHelplines && !preferences.includeWifi && !preferences.includeCharities) return null

  const placeColumns: CrisisPackPlaceColumn[] = []
  if (preferences.includeWifi) {
    placeColumns.push(placeColumn('wifi', 'Wi-Fi spots', snapshot.wifi, snapshot.placesSavedAt.wifi))
  }
  if (preferences.includeCharities) {
    placeColumns.push(placeColumn('charities', 'Charities', snapshot.support, snapshot.placesSavedAt.support))
  }

  return {
    kind: 'get-help',
    id: 'get-help',
    label: 'Get help',
    title: 'Your crisis pack',
    nameAndDateLabel: 'Name and date',
    helplines: preferences.includeHelplines ? packHelplines(snapshot) : undefined,
    placeColumns,
    freshnessNote: placeColumns.length > 0
      ? `Details were correct when this pack was downloaded on ${formatDownloadDate(downloadedAt)}. Check before relying on them.`
      : undefined,
  }
}

function checklistPage(kind: CrisisKind, label: string, snapshot: EmergencyPackSnapshot): UnnumberedPage {
  const groups = snapshot.checklists[kind]?.length ? snapshot.checklists[kind] : bundledPackChecklist(kind)
  const titles = crisisPackChecklistTitles[kind]
  const title = `${label} checklist`
  return {
    kind: 'checklist',
    id: `checklist-${kind}`,
    label: title,
    crisis: kind,
    title,
    subtitle: 'Tick each one when it is done',
    tasks: groups.flatMap((group) => group.items.map((item) => {
      const key = `${group.id}.${item.id}`
      return { id: key, title: titles[key] ?? item.task }
    })),
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
  }
}
