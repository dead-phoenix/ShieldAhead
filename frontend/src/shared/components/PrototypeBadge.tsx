import { WarningCircle } from '@phosphor-icons/react'

export function PrototypeBadge() {
  return (
    <span className="prototype-badge">
      <WarningCircle aria-hidden="true" size={15} weight="bold" />
      Prototype data — not verified
    </span>
  )
}
