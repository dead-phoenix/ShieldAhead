import type { CrisisKind } from '../crisis/crisisContent'

export const NEARBY_PLACE_LIMIT = 5
export const HANDWRITTEN_CONTACT_ROWS = 6

export const crisisPackOptions: {
  kind: CrisisKind
  label: string
  checklistTitle: string
}[] = [
  { kind: 'bushfire', label: 'Bushfire', checklistTitle: 'Bushfire Household Checklist' },
  { kind: 'flood', label: 'Flood', checklistTitle: 'Flood Household Checklist' },
  { kind: 'power-outage', label: 'Power outage', checklistTitle: 'Power Outage Household Checklist' },
]

/**
 * Short do and do-not points taken from the preparation guidance already
 * published in the crisis section. They are reminders for a paper copy,
 * not a replacement for current official warnings.
 */
export const crisisGuidelines: Record<CrisisKind, { dos: string[]; donts: string[] }> = {
  bushfire: {
    dos: [
      'Write down a bushfire plan and practise it with everyone in the household.',
      'Leave early when the trigger in that plan is reached.',
      'Check more than one official source, and keep a battery-powered radio available.',
      'Call 000 if someone is seriously injured, trapped, or directly threatened.',
    ],
    donts: [
      'Do not wait until you can see flames or smell smoke.',
      'Do not rely on receiving an official warning before you leave.',
      'Do not delay leaving to collect extra belongings.',
    ],
  },
  flood: {
    dos: [
      'Check the local flood risk and write down a safer place and more than one route.',
      'Follow current official warnings from VicEmergency.',
      'Leave when emergency services advise you to, and take the prepared kit.',
      'Call 000 if life is in immediate danger. Call VICSES on 132 500 for urgent flood assistance.',
    ],
    donts: [
      'Never walk, ride, or drive through floodwater.',
      'Do not return home until official advice says it is safe.',
      'Do not touch wet electrical equipment or repair utilities yourself.',
    ],
  },
  'power-outage': {
    dos: [
      'Prepare drinking water, food that does not need electric cooking, torches, and a battery-powered radio for at least 72 hours.',
      'Turn appliances off and keep fridge and freezer doors closed.',
      'Stay well clear of fallen powerlines and report them to the electricity distributor.',
      'Ask a licensed electrician to check wiring or appliances that may be damaged.',
    ],
    donts: [
      'Do not use candles for lighting.',
      'Never run a generator indoors, in a garage, or in another enclosed space.',
      'Never connect a generator to household wiring yourself.',
      'Do not use water-affected appliances until a qualified person says they are safe.',
    ],
  },
}
