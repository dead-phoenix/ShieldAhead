import { PencilSimple } from '@phosphor-icons/react'
import { Link, Navigate } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { StepProgress } from '../../../shared/components/StepProgress'
import { getOnboardingDraft } from '../../../storage/onboardingDraftStorage'

function valueOrSkipped(value: unknown) {
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'Skipped'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return value === undefined || value === '' ? 'Skipped' : String(value)
}

export function SetupReviewPage() {
  const draft = getOnboardingDraft()
  if (!draft?.profile.postcode) return <Navigate replace to={appRoutes.householdNeeds} />
  const rows = [
    ['Name', draft.profile.name],
    ['Age', draft.profile.age],
    ['Household size', draft.profile.householdSize],
    ['Children under 15', draft.profile.childrenUnder15],
    ['Pets', draft.profile.hasPets],
    ['Accessibility needs', draft.profile.accessibilityNeeds],
    ['Health needs', draft.profile.healthNeeds],
    ['Postcode', draft.profile.postcode],
  ]

  return (
    <section className="flow-page" aria-labelledby="review-title">
      <StepProgress current={3} total={3} />
      <h1 id="review-title">Review your details</h1>
      <p className="lead">Check what will be stored on this device before choosing optional uses.</p>
      <dl className="review-list">
        {rows.map(([label, value]) => <div key={String(label)}><dt>{label}</dt><dd>{valueOrSkipped(value)}</dd></div>)}
      </dl>
      <p className="local-note">Your details are currently a local draft and have not been uploaded.</p>
      <div className="flow-actions flow-actions--stacked">
        <Link className="button button--primary" to={appRoutes.consentChoices}>Continue to choices</Link>
        <Link className="button button--quiet" to={appRoutes.householdBasics}><PencilSimple aria-hidden="true" size={18} /> Edit details</Link>
      </div>
    </section>
  )
}
