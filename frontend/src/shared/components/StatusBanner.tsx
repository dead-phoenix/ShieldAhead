import type { ReactNode } from 'react'

type StatusBannerProps = {
  title: string
  children: ReactNode
  tone?: 'info' | 'warning' | 'success'
}

export function StatusBanner({
  title,
  children,
  tone = 'info',
}: StatusBannerProps) {
  return (
    <section className={`status-banner status-banner--${tone}`} aria-label={title} role="status" aria-live="polite">
      <strong>{title}</strong>
      <div>{children}</div>
    </section>
  )
}
