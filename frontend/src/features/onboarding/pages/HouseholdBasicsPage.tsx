import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { saveOnboardingDraft } from '../../../storage/onboardingDraftStorage'

export function HouseholdBasicsPage() {
  const navigate = useNavigate()
  const [householdError, setHouseholdError] = useState('')
  const [postcodeError, setPostcodeError] = useState('')
  const [storageError, setStorageError] = useState('')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const householdSize = Number(formData.get('householdSize'))
    const postcode = String(formData.get('postcode') ?? '').trim()
    let hasError = false

    setHouseholdError('')
    setPostcodeError('')
    setStorageError('')

    if (!Number.isInteger(householdSize) || householdSize < 1 || householdSize > 20) {
      setHouseholdError('Enter a household size between 1 and 20.')
      hasError = true
    }

    if (!/^\d{4}$/.test(postcode)) {
      setPostcodeError('Enter a four-digit Australian postcode.')
      hasError = true
    }

    if (hasError) {
      return
    }

    const wasSaved = saveOnboardingDraft({
      currentStep: 'household-basics',
      profile: {
        name: String(formData.get('name') ?? '').trim() || undefined,
        householdSize,
        postcode,
      },
      updatedAt: new Date().toISOString(),
    })

    if (!wasSaved) {
      setStorageError(
        'This browser could not save the draft. Check storage settings and try again.',
      )
      return
    }

    navigate(appRoutes.home)
  }

  return (
    <section className="flow-page" aria-labelledby="household-title">
      <div className="step-progress">
        <span>Step 2 of 5</span>
        <progress value="2" max="5">
          2 of 5
        </progress>
      </div>

      <h1 id="household-title">Household basics</h1>
      <p className="lead">
        These answers create a draft on this device. They are not uploaded.
      </p>

      <form className="form-stack" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="name">What should we call you? (optional)</label>
          <input id="name" name="name" autoComplete="name" />
          <p className="field-help">A first name or nickname is enough.</p>
        </div>

        <div className="field">
          <label htmlFor="householdSize">How many people live with you?</label>
          <input
            aria-describedby={householdError ? 'household-size-error' : undefined}
            aria-invalid={Boolean(householdError)}
            id="householdSize"
            name="householdSize"
            type="number"
            inputMode="numeric"
            min="1"
            max="20"
            defaultValue="1"
            required
          />
          {householdError ? (
            <p className="field-error" id="household-size-error" role="alert">
              {householdError}
            </p>
          ) : null}
        </div>

        <div className="field">
          <label htmlFor="postcode">Home postcode</label>
          <input
            aria-describedby={postcodeError ? 'postcode-error' : 'postcode-help'}
            aria-invalid={Boolean(postcodeError)}
            id="postcode"
            name="postcode"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={4}
            required
          />
          {postcodeError ? (
            <p className="field-error" id="postcode-error" role="alert">
              {postcodeError}
            </p>
          ) : (
            <p className="field-help" id="postcode-help">
              Used to organise nearby information. Exact location is not needed.
            </p>
          )}
        </div>

        {storageError ? (
          <p className="field-error" role="alert">
            {storageError}
          </p>
        ) : null}

        <div className="flow-actions">
          <button className="button button--primary" type="submit">
            Save draft and return home
          </button>
          <button
            className="button button--quiet"
            type="button"
            onClick={() => navigate(appRoutes.setup)}
          >
            Back
          </button>
        </div>
      </form>
    </section>
  )
}
