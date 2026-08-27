export function LoadingState({ label = 'Opening saved information' }: { label?: string }) {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <span className="loading-state__bar" aria-hidden="true" />
      <span>{label}…</span>
    </div>
  )
}
