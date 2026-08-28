import { ArrowLeft } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'

export function PageBackLink({ to, children }: { to: string; children: string }) {
  return (
    <Link className="back-link" to={to}>
      <ArrowLeft aria-hidden="true" size={18} weight="bold" />
      {children}
    </Link>
  )
}
