import { useEffect, useState } from 'react'
import { fetchChecklistItems, fetchHelplines } from '../../data/api/apiCrisisRepository'
import type { Helpline } from '../../data/api/apiCrisisRepository'
import type { CrisisChecklistGroup } from './crisisContent'

function groupChecklistRecords(records: Awaited<ReturnType<typeof fetchChecklistItems>>): CrisisChecklistGroup[] {
  const groups = new Map<string, CrisisChecklistGroup>()
  for (const record of records) {
    if (!groups.has(record.categoryId)) {
      groups.set(record.categoryId, { id: record.categoryId, title: record.category, items: [] })
    }
    groups.get(record.categoryId)!.items.push({
      id: record.itemId,
      label: record.task,
      description: record.description ?? '',
      steps: record.steps,
    })
  }
  return [...groups.values()]
}

/** Loads the pre-crisis checklist for a hazard from GET /api/checklist. */
export function useCrisisChecklist(kind: string): CrisisChecklistGroup[] {
  const [groups, setGroups] = useState<CrisisChecklistGroup[]>([])

  useEffect(() => {
    let isCurrent = true
    fetchChecklistItems(kind, { baseUrl: import.meta.env.VITE_API_BASE_URL ?? '' })
      .then((records) => {
        if (!isCurrent || records.length === 0) return
        setGroups(groupChecklistRecords(records))
      })
      .catch(() => {
        // Keep an empty checklist if the API call fails.
      })
    return () => {
      isCurrent = false
    }
  }, [kind])

  return groups
}

/** Loads the helpline directory scoped to one hazard page from GET /api/helplines.
 * Returns an empty list if the API is unreachable so callers can hide the section. */
export function useHelplines(kind: string): Helpline[] {
  const [helplines, setHelplines] = useState<Helpline[]>([])

  useEffect(() => {
    let isCurrent = true
    fetchHelplines({ baseUrl: import.meta.env.VITE_API_BASE_URL ?? '', crisisType: kind })
      .then((records) => {
        if (isCurrent) setHelplines(records)
      })
      .catch(() => {
        // No helpline section shown if the API call fails.
      })
    return () => {
      isCurrent = false
    }
  }, [kind])

  return helplines
}
