import { PencilSimple } from '@phosphor-icons/react'
import { Link, Navigate } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { LocalOnlyNote } from '../../../shared/components/LocalOnlyNote'
import { StepProgress } from '../../../shared/components/StepProgress'
import { getOnboardingDraft } from '../../../storage/onboardingDraftStorage'

function valueOrSkipped(value: unknown) {
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'Skipped'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return value === undefined || value === '' ? 'Skipped' : String(value)
}

export function SetupReviewPage() {
  const draft = getOnboardingDraft()
  if (!draft?.areaPostcode) return <Navigate replace to={appRoutes.householdNeeds} />
  const rows = [
    ['My area', draft.areaPostcode],
    ['Children under 15', draft.profile.childrenUnder15],
    ['Pets', draft.profile.hasPets],
    ['Accessibility needs', draft.profile.accessibilityNeeds],
    ['Health needs', draft.profile.healthNeeds],
  ]

  return (
    <section className="flow-page" aria-labelledby="review-title">
      <StepProgress current={2} total={2} />
      <h1 id="review-title">Review your details</h1>
      <p className="lead">Check what will be kept on this device before choosing which optional notes to keep.</p>
      <dl className="review-list">
        {rows.map(([label, value]) => <div key={String(label)}><dt>{label}</dt><dd>{valueOrSkipped(value)}</dd></div>)}
      </dl>
      <LocalOnlyNote variant="postcode" />
      <div className="flow-actions flow-actions--stacked">
        <Link className="button button--primary" to={appRoutes.consentChoices}>Continue to choices</Link>
        <Link className="button button--quiet" to={appRoutes.householdNeeds}><PencilSimple aria-hidden="true" size={18} /> Edit details</Link>
      </div>
    </section>
  )
}
