import { LockKey } from '@phosphor-icons/react'

const copy = {
  'no-postcode': 'Stays on this device. Nothing is sent to our servers.',
  postcode: 'Your postcode is used to look up nearby places. Your household details never leave this device.',
} as const

export function LocalOnlyNote({ variant }: { variant: keyof typeof copy }) {
  return (
    <div className="privacy-card local-only-note">
      <LockKey aria-hidden="true" size={22} />
      <p>{copy[variant]}</p>
    </div>
  )
}
