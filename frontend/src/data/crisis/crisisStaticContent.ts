import helplinesData from './helplines.json' with { type: 'json' }
import checklistData from './pre_crisis_checklist.json' with { type: 'json' }
import type { CrisisChecklistGroup } from '../../features/crisis/crisisContent'

export interface Helpline {
  id: string
  name: string
  serviceType: string
  phone: string
  website?: string
  description?: string
  availability?: string
  coverageArea?: string
}

interface HelplineRecord {
  id: string
  crisisType: string
  displayOrder: number
  name: string
  serviceType: string
  phone: string
  website?: string
  description?: string
  availability?: string | null
  coverageArea?: string
}

interface ChecklistGroupRecord {
  crisisType: string
  categoryId: string
  category: string
  items: { itemId: string; task: string; description: string; steps: string[] }[]
}

const helplineRecords = (helplinesData as { records: HelplineRecord[] }).records
const checklistGroupRecords = (checklistData as { groups: ChecklistGroupRecord[] }).groups

/** Helpline directory for one hazard page, bundled straight from
 * data/crisis/helplines.json — no API call involved. */
export function getHelplines(crisisType: string): Helpline[] {
  return helplineRecords
    .filter((record) => record.crisisType === crisisType)
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((record) => ({
      id: record.id,
      name: record.name,
      serviceType: record.serviceType,
      phone: record.phone,
      website: record.website,
      description: record.description,
      availability: record.availability ?? undefined,
      coverageArea: record.coverageArea,
    }))
}

/** Pre-crisis checklist groups for one hazard page, bundled straight from
 * data/crisis/pre_crisis_checklist.json — no API call involved. */
export function getChecklistGroups(crisisType: string): CrisisChecklistGroup[] {
  return checklistGroupRecords
    .filter((group) => group.crisisType === crisisType)
    .map((group) => ({
      id: group.categoryId,
      title: group.category,
      items: group.items.map((item) => ({
        id: item.itemId,
        label: item.task,
        description: item.description,
        steps: item.steps,
      })),
    }))
}
