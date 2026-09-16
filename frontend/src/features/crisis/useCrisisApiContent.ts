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

/** Loads the pre-crisis checklist for a hazard from the backend/Neon DB.
 * Falls back to the bundled `fallback` groups (from crisisContent.ts) if the
 * API is unreachable, so the page still works offline or if the DB is empty. */
export function useCrisisChecklist(kind: string, fallback: CrisisChecklistGroup[]): CrisisChecklistGroup[] {
  const [groups, setGroups] = useState<CrisisChecklistGroup[]>(fallback)

  useEffect(() => {
    let isCurrent = true
    fetchChecklistItems(kind, { baseUrl: import.meta.env.VITE_API_BASE_URL ?? '' })
      .then((records) => {
        if (!isCurrent || records.length === 0) return
        setGroups(groupChecklistRecords(records))
      })
      .catch(() => {
        // Keep the bundled fallback content if the API call fails.
      })
    return () => {
      isCurrent = false
    }
  }, [kind])

  return groups
}

/** Loads the helpline directory scoped to one hazard page from the
 * backend/Neon DB. Returns an empty list (rather than throwing) if the API
 * is unreachable, so callers can simply hide the section instead of
 * handling an error state. */
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
