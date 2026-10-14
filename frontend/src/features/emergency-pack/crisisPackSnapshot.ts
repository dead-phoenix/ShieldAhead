import type { ChecklistItemRecord, Helpline } from '../../data/api/apiCrisisRepository'
import type { CrisisKind } from '../crisis/crisisContent'
import { bundledChecklistGroups } from '../crisis/useCrisisApiContent'
import type { MapPlace } from '../map/model/mapTypes'
import { distinctPlaces } from './crisisPackPlaceText'
import { NEARBY_PLACE_LIMIT } from './emergencyPackContent'
import type { PackChecklistGroup, PackHelpline, PackPlace } from './emergencyPackStorage'

function toPackPlace(place: MapPlace): PackPlace {
  return {
    id: place.id,
    name: place.name,
    address: place.address,
    suburb: place.suburb,
    postcode: place.postcode,
    phone: place.phone,
    latitude: place.latitude,
    longitude: place.longitude,
  }
}

export function nearestPlaces(places: MapPlace[], kind: MapPlace['kind']): PackPlace[] {
  const sorted = [...places]
    .filter((place) => place.kind === kind)
    .sort((left, right) => (left.distanceKm ?? Number.POSITIVE_INFINITY) - (right.distanceKm ?? Number.POSITIVE_INFINITY))
    .map(toPackPlace)
  return distinctPlaces(sorted).slice(0, NEARBY_PLACE_LIMIT)
}

export function toPackHelplines(records: Helpline[]): PackHelpline[] {
  const seen = new Set<string>()
  return records.filter((record) => {
    const key = `${record.name}|${record.phone}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).map((record) => ({
    id: record.id,
    name: record.name,
    phone: record.phone,
    detail: [record.description, record.availability, record.coverageArea].filter(Boolean).join(' · ') || undefined,
  }))
}

export function toChecklistGroups(records: ChecklistItemRecord[]): PackChecklistGroup[] {
  const groups = new Map<string, PackChecklistGroup>()
  for (const record of [...records].sort((left, right) => left.displayOrder - right.displayOrder)) {
    if (!groups.has(record.categoryId)) {
      groups.set(record.categoryId, { id: record.categoryId, title: record.category, items: [] })
    }
    groups.get(record.categoryId)?.items.push({
      id: record.itemId,
      task: record.task,
      description: record.description,
      steps: record.steps,
    })
  }
  return [...groups.values()]
}

export function bundledPackChecklist(kind: CrisisKind): PackChecklistGroup[] {
  return bundledChecklistGroups(kind).map((group) => ({
    id: group.id,
    title: group.title,
    items: group.items.map((item) => ({ id: item.id, task: item.label, description: item.description, steps: item.steps })),
  }))
}
