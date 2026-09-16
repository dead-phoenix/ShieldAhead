export interface Helpline {
  id: string
  name: string
  serviceType: string
  phone: string
  website?: string
  description?: string
  availability?: string
  coverageArea?: string
  verifiedAgainst?: string
  verifiedOn?: string
}

export interface ChecklistItemRecord {
  id: string
  crisisType: string
  category: string
  categoryId: string
  itemId: string
  task: string
  description?: string
  steps: string[]
  displayOrder: number
  isActive: boolean
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Crisis API returned an invalid ${field}.`)
  }
  return value.trim()
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
}

function normalizeHelpline(value: unknown): Helpline {
  if (!isObject(value)) throw new Error('Crisis API returned a helpline that is not an object.')
  return {
    id: requiredString(value.id, 'helpline id'),
    name: requiredString(value.name, 'helpline name'),
    serviceType: requiredString(value.serviceType, 'helpline service type'),
    phone: requiredString(value.phone, 'helpline phone'),
    website: optionalString(value.website),
    description: optionalString(value.description),
    availability: optionalString(value.availability),
    coverageArea: optionalString(value.coverageArea),
    verifiedAgainst: optionalString(value.verifiedAgainst),
    verifiedOn: optionalString(value.verifiedOn),
  }
}

function normalizeChecklistItem(value: unknown): ChecklistItemRecord {
  if (!isObject(value)) throw new Error('Crisis API returned a checklist item that is not an object.')
  return {
    id: requiredString(value.id, 'checklist item id'),
    crisisType: requiredString(value.crisisType, 'checklist crisis type'),
    category: requiredString(value.category, 'checklist category'),
    categoryId: requiredString(value.categoryId, 'checklist category id'),
    itemId: requiredString(value.itemId, 'checklist item id field'),
    task: requiredString(value.task, 'checklist task'),
    description: optionalString(value.description),
    steps: stringArray(value.steps),
    displayOrder: typeof value.displayOrder === 'number' ? value.displayOrder : 0,
    isActive: value.isActive !== false,
  }
}

function apiUrl(baseUrl: string, path: string, params?: Record<string, string>): URL {
  const configuredOrigin = baseUrl.trim().replace(/\/$/, '')
  const origin = configuredOrigin || (typeof window === 'undefined' ? '' : window.location.origin)
  if (!origin) {
    throw new Error('VITE_API_BASE_URL is required to load API information.')
  }
  const url = new URL(path, `${origin}/`)
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value) url.searchParams.set(key, value)
  }
  return url
}

interface CrisisApiOptions {
  baseUrl?: string
  timeoutMs?: number
  fetcher?: typeof fetch
}

async function fetchRecords<T>(
  url: URL,
  normalize: (value: unknown) => T,
  { timeoutMs = 20_000, fetcher = fetch }: CrisisApiOptions,
): Promise<T[]> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetcher(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`Crisis API request failed with status ${response.status}.`)
    }
    const payload = await response.json() as unknown
    if (!isObject(payload) || !Array.isArray(payload.records)) {
      throw new Error('Crisis API returned an invalid response shape.')
    }
    return payload.records.map(normalize)
  } finally {
    window.clearTimeout(timeout)
  }
}

export async function fetchHelplines(
  options: CrisisApiOptions & { serviceType?: string; crisisType?: string } = {},
): Promise<Helpline[]> {
  const url = apiUrl(options.baseUrl ?? '', '/api/helplines', {
    serviceType: options.serviceType ?? '',
    crisisType: options.crisisType ?? '',
  })
  return fetchRecords(url, normalizeHelpline, options)
}

export async function fetchChecklistItems(
  crisisType: string,
  options: CrisisApiOptions = {},
): Promise<ChecklistItemRecord[]> {
  const url = apiUrl(options.baseUrl ?? '', '/api/checklist', { crisisType })
  return fetchRecords(url, normalizeChecklistItem, options)
}
