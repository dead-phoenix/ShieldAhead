import type { CrisisKind } from '../crisis/crisisContent'

export interface CrisisPackSource {
  label: string
  url: string
}

/**
 * Printed as plain text at the bottom of each checklist page, so use the full URL.
 * Entries with an empty label or url are left out of the pack.
 */
export const crisisPackSources: Record<CrisisKind, CrisisPackSource[]> = {
  bushfire: [
    { label: '', url: '' },
  ],
  flood: [
    { label: '', url: '' },
  ],
  'power-outage': [
    { label: '', url: '' },
  ],
}
