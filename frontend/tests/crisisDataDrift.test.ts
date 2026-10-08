import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Guards against the hand-synced frontend copies drifting from the backend
// data. It only reports differences; it does not decide which copy is right.

const testDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(testDir, '../..')

type JsonRecord = Record<string, unknown>

function readJson(relativePath: string): JsonRecord {
  return JSON.parse(readFileSync(resolve(repoRoot, relativePath), 'utf8')) as JsonRecord
}

function asRecords(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value as JsonRecord[] : []
}

function pick(record: JsonRecord, fields: readonly string[]): JsonRecord {
  return Object.fromEntries(fields.map((field) => [field, record[field] ?? null]))
}

const helplineFields = ['id', 'name', 'phone', 'website', 'serviceType', 'crisisType', 'availability'] as const
const checklistGroupFields = ['crisisType', 'categoryId', 'category'] as const
const checklistItemFields = ['itemId', 'task', 'description', 'steps'] as const

describe('crisis data drift between backend and frontend copies', () => {
  it('backend/data/helplines.json and the frontend helplines.json match in fields and order', () => {
    const backend = asRecords(readJson('backend/data/helplines.json').records)
    const frontend = asRecords(readJson('frontend/src/features/crisis/data/helplines.json').records)

    expect(backend.length).toBeGreaterThan(0)
    expect(frontend.map((record) => record.id), 'helpline ids or order differ').toEqual(backend.map((record) => record.id))
    backend.forEach((record, index) => {
      expect(pick(frontend[index], helplineFields), `helpline "${String(record.id)}" (position ${index + 1}) differs`)
        .toEqual(pick(record, helplineFields))
    })
  })

  it('backend/data/pre_crisis_checklist.json and the frontend preCrisisChecklist.json match in fields and order', () => {
    const backend = asRecords(readJson('backend/data/pre_crisis_checklist.json').groups)
    const frontend = asRecords(readJson('frontend/src/features/crisis/data/preCrisisChecklist.json').groups)
    const groupKey = (group: JsonRecord) => `${String(group.crisisType)}/${String(group.categoryId)}`

    expect(backend.length).toBeGreaterThan(0)
    expect(frontend.map(groupKey), 'checklist groups or order differ').toEqual(backend.map(groupKey))
    backend.forEach((group, groupIndex) => {
      const label = `checklist group "${groupKey(group)}"`
      expect(pick(frontend[groupIndex], checklistGroupFields), `${label} differs`).toEqual(pick(group, checklistGroupFields))

      const backendItems = asRecords(group.items)
      const frontendItems = asRecords(frontend[groupIndex].items)
      expect(frontendItems.map((item) => item.itemId), `${label} item ids or order differ`).toEqual(backendItems.map((item) => item.itemId))
      backendItems.forEach((item, itemIndex) => {
        expect(pick(frontendItems[itemIndex], checklistItemFields), `${label} item "${String(item.itemId)}" differs`)
          .toEqual(pick(item, checklistItemFields))
      })
    })
  })
})
