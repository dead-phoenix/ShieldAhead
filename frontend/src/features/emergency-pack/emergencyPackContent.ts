import type { CrisisKind } from '../crisis/crisisContent'

export const NEARBY_PLACE_LIMIT = 5
export const HANDWRITTEN_CONTACT_ROWS = 6

export const crisisPackOptions: {
  kind: CrisisKind
  label: string
}[] = [
  { kind: 'bushfire', label: 'Bushfire' },
  { kind: 'flood', label: 'Flood' },
  { kind: 'power-outage', label: 'Power outage' },
]
