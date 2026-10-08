import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { LocalOnlyNote } from '../../../shared/components/LocalOnlyNote'
import { StepProgress } from '../../../shared/components/StepProgress'
import { getMyArea } from '../../../storage/myAreaStorage'
import { getHouseholdProfile, getOnboardingDraft, saveOnboardingDraft } from '../../../storage/onboardingDraftStorage'

function toList(value: FormDataEntryValue | null) {
  return String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean)
}

export function HouseholdNeedsPage() {
  const navigate = useNavigate()
  const draft = getOnboardingDraft()
  const savedProfile = getHouseholdProfile()
  const currentProfile = draft?.profile ?? savedProfile ?? {}
  const currentAreaPostcode = draft?.areaPostcode ?? getMyArea()?.postcode ?? ''
  const [postcodeError, setPostcodeError] = useState('')
  const [storageError, setStorageError] = useState('')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const postcode = String(formData.get('postcode') ?? '').trim()
    if (!/^\d{4}$/.test(postcode)) {
      setPostcodeError('Enter a four-digit Australian postcode, such as 3453.')
      return
    }
    const childrenValue = String(formData.get('childrenUnder15') ?? '')
    const wasSaved = saveOnboardingDraft({
      currentStep: 'review',
      profile: {
        ...currentProfile,
        childrenUnder15: childrenValue ? Number(childrenValue) : undefined,
        hasPets: formData.get('hasPets') === 'yes',
        accessibilityNeeds: toList(formData.get('accessibilityNeeds')),
        healthNeeds: toList(formData.get('healthNeeds')),
      },
      areaPostcode: postcode,
      updatedAt: new Date().toISOString(),
    })
    if (!wasSaved) {
      setStorageError('This browser could not save your draft. Check storage settings and try again.')
      return
    }
    navigate(appRoutes.setupReview)
  }

  return (
    <section className="flow-page" aria-labelledby="needs-title">
      <StepProgress current={1} total={2} />
      <h1 id="needs-title">About your household</h1>
      <p className="lead">Only My area is required. Everything else is optional notes about your household, kept on this device.</p>
      <form className="form-stack" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="postcode">My area (postcode) <strong>Required</strong></label>
          <input aria-describedby={postcodeError ? 'postcode-error' : 'postcode-help'} aria-invalid={Boolean(postcodeError)} id="postcode" name="postcode" inputMode="numeric" autoComplete="postal-code" maxLength={4} defaultValue={currentAreaPostcode} required />
          {postcodeError ? <p className="field-error" id="postcode-error" role="alert">{postcodeError}</p> : <p className="field-help" id="postcode-help">Your crisis pack is built for this area. Exact location is not needed.</p>}
        </div>
        <div className="field-grid">
          <div className="field">
            <label htmlFor="childrenUnder15">Children under 15 <span>Optional</span></label>
            <input id="childrenUnder15" name="childrenUnder15" type="number" inputMode="numeric" min="0" max="20" defaultValue={currentProfile.childrenUnder15} />
          </div>
          <fieldset className="field choice-field">
            <legend>Pets <span>Optional</span></legend>
            <label className="check-row"><input type="checkbox" name="hasPets" value="yes" defaultChecked={currentProfile.hasPets} /> Our household has pets</label>
          </fieldset>
        </div>
        <div className="field">
          <label htmlFor="accessibilityNeeds">Accessibility needs <span>Optional</span></label>
          <input id="accessibilityNeeds" name="accessibilityNeeds" defaultValue={currentProfile.accessibilityNeeds?.join(', ')} />
          <p className="field-help">Separate multiple needs with commas.</p>
        </div>
        <div className="field">
          <label htmlFor="healthNeeds">Health needs <span>Optional</span></label>
          <input id="healthNeeds" name="healthNeeds" defaultValue={currentProfile.healthNeeds?.join(', ')} />
          <p className="field-help">For example, medication needs refrigeration.</p>
        </div>
        <LocalOnlyNote variant="postcode" />
        {storageError ? <p className="field-error" role="alert">{storageError}</p> : null}
        <div className="flow-actions">
          <button className="button button--quiet" type="button" onClick={() => navigate(appRoutes.setupPrivacy)}>Back</button>
          <button className="button button--primary" type="submit">Review details</button>
        </div>
      </form>
    </section>
  )
}
