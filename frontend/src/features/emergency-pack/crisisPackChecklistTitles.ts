import type { CrisisKind } from '../crisis/crisisContent'

/**
 * Short printed titles keyed by `${categoryId}.${itemId}` from the checklist data.
 * Items without an entry fall back to their full task text.
 */
export const crisisPackChecklistTitles: Record<CrisisKind, Record<string, string>> = {
  bushfire: {
    'household-plan.plan-reviewed': 'Write your plan',
    'household-plan.leave-destination': 'Choose where you will go',
    'household-plan.kit-ready': 'Pack an emergency kit',
    'household-plan.documents-ready': 'Gather documents',
    'children-pets.dependants-plan': 'Name a helper per dependant',
    'children-pets.pet-plan': 'Get pets ready',
    'health-access.health-needs': 'Plan medication and access',
    'health-access.contacts-ready': 'Write key numbers on paper',
  },
  flood: {
    'household-plan.local-information': 'Check local flood risk',
    'household-plan.contact-plan': 'Write contact plan',
    'household-plan.kit-ready': 'Pack an emergency kit',
    'household-plan.items-lifted': 'Plan items to move higher',
    'children-pets.dependants-plan': 'Name a helper per dependant',
    'children-pets.pet-plan': 'Get pets ready',
    'health-access.medicine-plan': 'Plan medication and access',
    'health-access.contacts-ready': 'Write emergency numbers',
  },
  'power-outage': {
    'household-plan.outage-plan': 'Set aside 72 hours of supplies',
    'household-plan.lighting-plan': 'Backup lighting',
    'household-plan.power-bank': 'Charge phone and power bank',
    'household-plan.distributor-ready': 'Write distributor details',
    'children-pets.dependants-plan': 'Supplies for children',
    'children-pets.pet-plan': 'Supplies for pets',
    'health-access.powered-equipment': 'Backup for medical equipment',
    'health-access.medicine-plan': 'Ask about refrigerated medicine',
  },
}
