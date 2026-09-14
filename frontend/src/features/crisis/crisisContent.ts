export type CrisisKind = 'bushfire' | 'flood' | 'power-outage'

export type CrisisChecklistGroup = {
  id: string
  title: string
  items: { id: string; label: string; description: string }[]
}

export type CrisisContent = {
  kind: CrisisKind
  title: string
  summary: string
  sourceOwner: string
  checklist: CrisisChecklistGroup[]
}

export const crisisContent: CrisisContent[] = [
  {
    kind: 'bushfire', title: 'Prepare for bushfire',
    summary: 'A dedicated space for reviewed bushfire preparation guidance and household planning.',
    sourceOwner: 'CFA source material — content review pending',
    checklist: [
      { id: 'household-plan', title: 'Household plan', items: [
        { id: 'plan-reviewed', label: 'Bushfire plan reviewed', description: 'Confirm the household has reviewed its written plan.' },
        { id: 'leave-destination', label: 'Early-leaving destination recorded', description: 'Record the agreed destination in the household plan.' },
      ] },
      { id: 'children-pets', title: 'Children and pets', items: [
        { id: 'dependants-plan', label: 'Children and dependant arrangements reviewed', description: 'Confirm who is responsible for each dependant.' },
        { id: 'pet-plan', label: 'Pet transport plan reviewed', description: 'Confirm transport and essential pet items are planned.' },
      ] },
      { id: 'health-access', title: 'Health and accessibility', items: [
        { id: 'health-needs', label: 'Health and accessibility needs reviewed', description: 'Record any support needed to leave early.' },
      ] },
    ],
  },
  {
    kind: 'flood', title: 'Prepare for flood',
    summary: 'A dedicated space for reviewed flood preparation guidance and household planning.',
    sourceOwner: 'VICSES source material — content review pending',
    checklist: [
      { id: 'household-plan', title: 'Household plan', items: [
        { id: 'local-information', label: 'Local flood information reviewed', description: 'Confirm the household has reviewed relevant local information.' },
        { id: 'contact-plan', label: 'Household contact plan reviewed', description: 'Record how household members will contact each other.' },
      ] },
      { id: 'children-pets', title: 'Children and pets', items: [
        { id: 'dependants-plan', label: 'Children and dependant arrangements reviewed', description: 'Confirm who is responsible for each dependant.' },
        { id: 'pet-plan', label: 'Pet arrangements reviewed', description: 'Confirm transport and essential pet items are planned.' },
      ] },
      { id: 'health-access', title: 'Health and accessibility', items: [
        { id: 'medicine-plan', label: 'Medicine and accessibility needs reviewed', description: 'Record essential health items and assistance needs.' },
      ] },
    ],
  },
  {
    kind: 'power-outage', title: 'Prepare for an extended power outage',
    summary: 'A dedicated space for reviewed extended power outage preparation and household planning.',
    sourceOwner: 'Authoritative source review pending',
    checklist: [
      { id: 'household-plan', title: 'Household essentials', items: [
        { id: 'outage-plan', label: 'Household outage plan reviewed', description: 'Confirm the household knows what to do during a longer outage.' },
        { id: 'lighting-plan', label: 'Backup lighting plan reviewed', description: 'Record the household backup lighting arrangements.' },
      ] },
      { id: 'children-pets', title: 'Children and pets', items: [
        { id: 'dependants-plan', label: 'Children and dependant needs reviewed', description: 'Confirm essential care arrangements during an outage.' },
        { id: 'pet-plan', label: 'Pet needs reviewed', description: 'Confirm essential pet care arrangements.' },
      ] },
      { id: 'health-access', title: 'Health and accessibility', items: [
        { id: 'powered-equipment', label: 'Powered medical equipment plan reviewed', description: 'Record any backup arrangements that require team verification.' },
      ] },
    ],
  },
]

export function getCrisisContent(kind: string | undefined) {
  return crisisContent.find((item) => item.kind === kind)
}
