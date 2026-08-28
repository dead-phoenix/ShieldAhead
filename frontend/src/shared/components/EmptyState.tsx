import type { ReactNode } from 'react'

type EmptyStateProps = {
  title: string
  children: ReactNode
  action?: ReactNode
}

export function EmptyState({ title, children, action }: EmptyStateProps) {
  return (
    <section className="empty-state">
      <h2>{title}</h2>
      <div>{children}</div>
      {action ? <div className="empty-state__action">{action}</div> : null}
    </section>
  )
}
