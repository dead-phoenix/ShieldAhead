import { LockKey } from '@phosphor-icons/react'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { StepProgress } from '../../../shared/components/StepProgress'
import { clearOnboardingDraft, getOnboardingDraft, saveConsentState, saveHouseholdProfile } from '../../../storage/onboardingDraftStorage'

const categories = [
  ['basics', 'Household basics', 'Name, age and household size'],
  ['dependants', 'Children and pets', 'Used to tailor household guidance'],
  ['needs', 'Health and accessibility', 'Used to highlight relevant preparation tips'],
] as const

export function ConsentChoicesPage() {
  const navigate = useNavigate()
  const draft = getOnboardingDraft()
  const [choices, setChoices] = useState<Record<string, boolean | null>>({ basics: null, dependants: null, needs: null })
  const [error, setError] = useState('')
  if (!draft?.profile.postcode) return <Navigate replace to={appRoutes.householdNeeds} />

  function finishSetup() {
    const sourceProfile = draft!.profile
    const profileSaved = saveHouseholdProfile({
      postcode: sourceProfile.postcode!,
      ...(choices.basics === true
        ? {
            name: sourceProfile.name,
            age: sourceProfile.age,
            householdSize: sourceProfile.householdSize,
          }
        : {}),
      ...(choices.dependants === true
        ? {
            childrenUnder15: sourceProfile.childrenUnder15,
            hasPets: sourceProfile.hasPets,
          }
        : {}),
      ...(choices.needs === true
        ? {
            accessibilityNeeds: sourceProfile.accessibilityNeeds,
            healthNeeds: sourceProfile.healthNeeds,
          }
        : {}),
    })
    const consentSaved = saveConsentState({
      profileStorageAccepted: true,
      optionalCategories: Object.fromEntries(Object.entries(choices).map(([key, value]) => [key, value === true])),
      updatedAt: new Date().toISOString(),
    })
    if (!profileSaved || !consentSaved) {
      setError('Your choices could not be saved on this device. Check browser storage settings and try again.')
      return
    }
    clearOnboardingDraft()
    navigate(appRoutes.setupComplete)
  }

  return (
    <section className="flow-page" aria-labelledby="choices-title">
      <StepProgress current={3} total={3} />
      <h1 id="choices-title">Your choices</h1>
      <p className="lead">Nothing here is required to use ShieldAhead. Choose what stays on this device.</p>
      <div className="choice-card-list">
        {categories.map(([id, title, copy]) => (
          <fieldset className="choice-card" key={id}>
            <legend>{title}</legend><p>{copy}</p>
            <div className="segmented-control">
              <label><input type="radio" name={id} checked={choices[id] === true} onChange={() => setChoices((current) => ({ ...current, [id]: true }))} /><span>Allow</span></label>
              <label><input type="radio" name={id} checked={choices[id] === false} onChange={() => setChoices((current) => ({ ...current, [id]: false }))} /><span>Not now</span></label>
            </div>
            <small>{choices[id] === null ? 'Not selected' : choices[id] ? 'Allowed on this device' : 'Not allowed'}</small>
          </fieldset>
        ))}
      </div>
      <div className="privacy-card"><LockKey aria-hidden="true" size={22} /><p>Your choices stay on this device. You can change them later in Profile.</p></div>
      {error ? <p className="field-error" role="alert">{error}</p> : null}
      <div className="flow-actions flow-actions--stacked">
        <button className="button button--primary" type="button" onClick={finishSetup}>Save choices and continue</button>
        <button className="button button--quiet" type="button" onClick={() => navigate(appRoutes.setupReview)}>Back</button>
      </div>
    </section>
  )
}
