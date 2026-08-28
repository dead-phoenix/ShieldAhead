import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { StepProgress } from '../../../shared/components/StepProgress'
import { getHouseholdProfile, getOnboardingDraft, saveOnboardingDraft } from '../../../storage/onboardingDraftStorage'

export function HouseholdBasicsPage() {
  const navigate = useNavigate()
  const draft = getOnboardingDraft()
  const savedProfile = getHouseholdProfile()
  const currentProfile = draft?.profile ?? savedProfile ?? {}
  const [storageError, setStorageError] = useState('')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const ageValue = String(formData.get('age') ?? '')
    const sizeValue = String(formData.get('householdSize') ?? '')
    const wasSaved = saveOnboardingDraft({
      currentStep: 'household-needs',
      profile: {
        ...currentProfile,
        name: String(formData.get('name') ?? '').trim() || undefined,
        age: ageValue ? Number(ageValue) : undefined,
        householdSize: sizeValue ? Number(sizeValue) : undefined,
      },
      updatedAt: new Date().toISOString(),
    })
    if (!wasSaved) {
      setStorageError('This browser could not save your draft. Check storage settings and try again.')
      return
    }
    navigate(appRoutes.householdNeeds)
  }

  return (
    <section className="flow-page" aria-labelledby="household-title">
      <StepProgress current={1} total={3} />
      <h1 id="household-title">About your household</h1>
      <p className="lead">Only the postcode is required. Everything else can be skipped.</p>
      <form className="form-stack" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="name">Name <span>Optional</span></label>
          <input id="name" name="name" autoComplete="name" defaultValue={currentProfile.name} />
          <p className="field-help">A first name or nickname is enough.</p>
        </div>
        <div className="field-grid">
          <div className="field">
            <label htmlFor="age">Age <span>Optional</span></label>
            <input id="age" name="age" type="number" inputMode="numeric" min="0" max="120" defaultValue={currentProfile.age} />
          </div>
          <div className="field">
            <label htmlFor="householdSize">Household size <span>Optional</span></label>
            <input id="householdSize" name="householdSize" type="number" inputMode="numeric" min="1" max="20" defaultValue={currentProfile.householdSize} />
          </div>
        </div>
        {storageError ? <p className="field-error" role="alert">{storageError}</p> : null}
        <div className="flow-actions">
          <button className="button button--quiet" type="button" onClick={() => navigate(appRoutes.setupPrivacy)}>Back</button>
          <button className="button button--primary" type="submit">Continue</button>
        </div>
      </form>
    </section>
  )
}
