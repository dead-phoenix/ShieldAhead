export function StepProgress({ current, total }: { current: number; total: number }) {
  return (
    <div className="step-progress">
      <div>
        <span>Setup</span>
        <strong>
          Step {current} of {total}
        </strong>
      </div>
      <progress value={current} max={total}>
        Step {current} of {total}
      </progress>
    </div>
  )
}
