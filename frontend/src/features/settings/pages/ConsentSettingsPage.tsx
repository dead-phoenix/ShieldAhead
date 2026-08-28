import { Info, LockKey } from '@phosphor-icons/react'
import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { PageBackLink } from '../../../shared/components/PageBackLink'
import {
  getConsentState,
  getHouseholdProfile,
  saveConsentChoices,
} from '../../../storage/onboardingDraftStorage'

const categories = [
  ['basics', 'Household basics', 'Name, age and household size'],
  ['dependants', 'Children and pets', 'Used to tailor household guidance'],
  ['needs', 'Health and accessibility', 'Used to highlight relevant preparation tips'],
] as const

function inferChoices() {
  const consent = getConsentState()
  const profile = getHouseholdProfile()
  return {
    basics: consent?.optionalCategories.basics ?? Boolean(profile?.name || profile?.age || profile?.householdSize),
    dependants: consent?.optionalCategories.dependants ?? Boolean(profile?.childrenUnder15 !== undefined || profile?.hasPets !== undefined),
    needs: consent?.optionalCategories.needs ?? Boolean(profile?.accessibilityNeeds?.length || profile?.healthNeeds?.length),
  }
}

export function ConsentSettingsPage() {
  const profile = getHouseholdProfile()
  const [choices, setChoices] = useState(inferChoices)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  if (!profile) return <Navigate replace to={appRoutes.settings} />

  function saveChanges() {
    setError('')
    setMessage('')
    if (!saveConsentChoices(choices)) {
      setError('Your choices could not be saved. Check browser storage settings and try again.')
      return
    }
    setMessage('Your consent choices were updated on this device.')
  }

  return (
    <section className="flow-page settings-flow-page" aria-labelledby="consent-settings-title">
      <PageBackLink to={appRoutes.settings}>Back to profile</PageBackLink>
      <h1 id="consent-settings-title">Consent choices</h1>
      <p className="lead">Choose which optional household details ShieldAhead may keep on this device.</p>

      <div className="notice-card consent-removal-note">
        <Info aria-hidden="true" size={22} />
        <p>Choosing “Not now” removes information in that category. Allowing it again later does not restore deleted details.</p>
      </div>

      <div className="choice-card-list">
        {categories.map(([id, title, copy]) => (
          <fieldset className="choice-card" key={id}>
            <legend>{title}</legend>
            <p>{copy}</p>
            <div className="segmented-control">
              <label><input type="radio" name={id} checked={choices[id]} onChange={() => setChoices((current) => ({ ...current, [id]: true }))} /><span>Allow</span></label>
              <label><input type="radio" name={id} checked={!choices[id]} onChange={() => setChoices((current) => ({ ...current, [id]: false }))} /><span>Not now</span></label>
            </div>
            <small>{choices[id] ? 'Allowed on this device' : 'Not allowed — saved details will be removed'}</small>
          </fieldset>
        ))}
      </div>

      <div className="privacy-card"><LockKey aria-hidden="true" size={22} /><p>Your postcode is stored separately because it is required to organise nearby information.</p></div>
      {message ? <p className="inline-status" role="status" aria-live="polite">{message}</p> : null}
      {error ? <p className="field-error" role="alert">{error}</p> : null}
      <button className="button button--primary settings-save-button" type="button" onClick={saveChanges}>Save consent choices</button>
    </section>
  )
}
