import { Info, ShieldCheck } from '@phosphor-icons/react'
import type { WifiLocation } from '../../../data/contracts'

interface WifiVerificationBadgeProps {
  status: WifiLocation['verificationStatus']
}

export function WifiVerificationBadge({ status }: WifiVerificationBadgeProps) {
  if (!status) return null

  const confirmed = status === 'confirmed'

  return (
    <span className={`verification-badge verification-badge--${status}`}>
      {confirmed
        ? <ShieldCheck aria-hidden="true" size={15} weight="bold" />
        : <Info aria-hidden="true" size={15} weight="bold" />}
      {confirmed ? 'Confirmed Wi-Fi listing' : 'Wi-Fi likely — check first'}
    </span>
  )
}
