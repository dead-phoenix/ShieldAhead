import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { LocalOnlyNote } from '../../../shared/components/LocalOnlyNote'
import { StepProgress } from '../../../shared/components/StepProgress'
import { saveMyArea } from '../../../storage/myAreaStorage'
import {
  clearOnboardingDraft,
  getOnboardingDraft,
  profileForChoices,
  saveConsentState,
  saveHouseholdProfile,
} from '../../../storage/onboardingDraftStorage'
import { householdCategories } from '../householdCategories'

export function ConsentChoicesPage() {
  const navigate = useNavigate()
  const draft = getOnboardingDraft()
  const [choices, setChoices] = useState<Record<string, boolean | null>>({ dependants: null, needs: null })
  const [error, setError] = useState('')
  if (!draft?.areaPostcode) return <Navigate replace to={appRoutes.householdNeeds} />

  function finishSetup() {
    const areaSaved = saveMyArea({
      postcode: draft!.areaPostcode!,
      localityId: draft!.areaLocalityId,
      localityName: draft!.areaLocalityName,
    })
    const profileSaved = saveHouseholdProfile(profileForChoices(draft!.profile, choices))
    const consentSaved = saveConsentState({
      profileStorageAccepted: true,
      optionalCategories: Object.fromEntries(Object.entries(choices).map(([key, value]) => [key, value === true])),
      updatedAt: new Date().toISOString(),
    })
    if (!areaSaved || !profileSaved || !consentSaved) {
      setError('Your choices could not be saved on this device. Check browser storage settings and try again.')
      return
    }
    clearOnboardingDraft()
    navigate(appRoutes.setupComplete)
  }

  return (
    <section className="flow-page" aria-labelledby="choices-title">
      <StepProgress current={2} total={2} />
      <h1 id="choices-title">Your choices</h1>
      <p className="lead">Nothing here is required to use ShieldAhead. Choose which optional notes stay on this device.</p>
      <div className="choice-card-list">
        {householdCategories.map(([id, title, copy]) => (
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
      <LocalOnlyNote variant="postcode" />
      <p className="field-help">You can change these choices later in Profile.</p>
      {error ? <p className="field-error" role="alert">{error}</p> : null}
      <div className="flow-actions flow-actions--stacked">
        <button className="button button--primary" type="button" onClick={finishSetup}>Save choices and continue</button>
        <button className="button button--quiet" type="button" onClick={() => navigate(appRoutes.setupReview)}>Back</button>
      </div>
    </section>
  )
}
