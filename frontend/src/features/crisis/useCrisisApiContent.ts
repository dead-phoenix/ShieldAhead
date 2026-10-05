import { useEffect, useState } from 'react'
import { fetchChecklistItems, fetchHelplines } from '../../data/api/apiCrisisRepository'
import type { Helpline } from '../../data/api/apiCrisisRepository'
import type { CrisisChecklistGroup } from './crisisContent'
import bundledChecklist from './data/preCrisisChecklist.json'
import bundledHelplines from './data/helplines.json'

interface BundledChecklistGroup {
  crisisType: string
  categoryId: string
  category: string
  items: { itemId: string; task: string; description: string; steps: string[] }[]
}

export function bundledChecklistGroups(kind: string): CrisisChecklistGroup[] {
  return (bundledChecklist.groups as BundledChecklistGroup[])
    .filter((group) => group.crisisType === kind)
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

/** Shows the bundled pre-crisis checklist straight away, then replaces it
 * with GET /api/checklist when the API responds. */
export function useCrisisChecklist(kind: string): CrisisChecklistGroup[] {
  const [groups, setGroups] = useState<CrisisChecklistGroup[]>(() => bundledChecklistGroups(kind))

  useEffect(() => {
    let isCurrent = true
    setGroups(bundledChecklistGroups(kind))
    fetchChecklistItems(kind, { baseUrl: import.meta.env.VITE_API_BASE_URL ?? '' })
      .then((records) => {
        if (!isCurrent || records.length === 0) return
        setGroups(groupChecklistRecords(records))
      })
      .catch(() => {
        // Keep the bundled checklist if the API call fails.
      })
    return () => {
      isCurrent = false
    }
  }, [kind])

  return groups
}

interface BundledHelpline extends Helpline {
  crisisType: string
}

export function bundledHelplinesFor(kind: string): Helpline[] {
  return (bundledHelplines.records as BundledHelpline[])
    .filter((record) => record.crisisType === kind)
    .map(({ crisisType: _crisisType, ...helpline }) => helpline)
}

/** Shows the bundled helpline directory straight away, then replaces it
 * with GET /api/helplines when the API responds — same "works offline,
 * refreshes when it can" pattern as useCrisisChecklist. Without this, the
 * helpline numbers (including Triple Zero) would silently disappear from
 * the page whenever the API is unreachable. */
export function useHelplines(kind: string): Helpline[] {
  const [helplines, setHelplines] = useState<Helpline[]>(() => bundledHelplinesFor(kind))

  useEffect(() => {
    let isCurrent = true
    setHelplines(bundledHelplinesFor(kind))
    fetchHelplines({ baseUrl: import.meta.env.VITE_API_BASE_URL ?? '', crisisType: kind })
      .then((records) => {
        if (!isCurrent || records.length === 0) return
        setHelplines(records)
      })
      .catch(() => {
        // Keep the bundled helplines if the API call fails.
      })
    return () => {
      isCurrent = false
    }
  }, [kind])

  return helplines
}
