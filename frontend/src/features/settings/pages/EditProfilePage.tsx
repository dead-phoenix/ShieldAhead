import { LockKey } from '@phosphor-icons/react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import type { HouseholdProfile } from '../../../data/contracts'
import { PageBackLink } from '../../../shared/components/PageBackLink'
import {
  getConsentState,
  getHouseholdProfile,
  saveHouseholdProfile,
} from '../../../storage/onboardingDraftStorage'

function toOptionalNumber(value: FormDataEntryValue | null) {
  const text = String(value ?? '').trim()
  return text ? Number(text) : undefined
}

function toList(value: FormDataEntryValue | null) {
  return String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean)
}

export function EditProfilePage() {
  const profile = getHouseholdProfile()
  const consent = getConsentState()
  const [postcodeError, setPostcodeError] = useState('')
  const [message, setMessage] = useState('')
  const [storageError, setStorageError] = useState('')

  if (!profile) return <Navigate replace to={appRoutes.settings} />

  const choices = {
    basics: consent?.optionalCategories.basics ?? true,
    dependants: consent?.optionalCategories.dependants ?? true,
    needs: consent?.optionalCategories.needs ?? true,
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPostcodeError('')
    setMessage('')
    setStorageError('')
    const formData = new FormData(event.currentTarget)
    const postcode = String(formData.get('postcode') ?? '').trim()
    if (!/^\d{4}$/.test(postcode)) {
      setPostcodeError('Enter a four-digit Australian postcode, such as 3453.')
      return
    }

    const updatedProfile: HouseholdProfile = {
      postcode,
      ...(choices.basics
        ? {
            name: String(formData.get('name') ?? '').trim() || undefined,
            age: toOptionalNumber(formData.get('age')),
            householdSize: toOptionalNumber(formData.get('householdSize')),
          }
        : {}),
      ...(choices.dependants
        ? {
            childrenUnder15: toOptionalNumber(formData.get('childrenUnder15')),
            hasPets: formData.get('hasPets') === 'yes',
          }
        : {}),
      ...(choices.needs
        ? {
            accessibilityNeeds: toList(formData.get('accessibilityNeeds')),
            healthNeeds: toList(formData.get('healthNeeds')),
          }
        : {}),
    }

    if (!saveHouseholdProfile(updatedProfile)) {
      setStorageError('Your profile could not be saved. Check browser storage settings and try again.')
      return
    }
    setMessage('Your profile was updated on this device.')
  }

  return (
    <section className="flow-page settings-flow-page" aria-labelledby="edit-profile-title">
      <PageBackLink to={appRoutes.settings}>Back to profile</PageBackLink>
      <h1 id="edit-profile-title">Edit household details</h1>
      <p className="lead">Update the information stored on this device. Only postcode is required.</p>

      <div className="privacy-card edit-consent-note"><LockKey aria-hidden="true" size={22} /><p>Fields in a category you have not allowed remain unavailable. <Link to={appRoutes.consentSettings}>Change consent choices</Link> first if you want to add them.</p></div>

      <form className="form-stack profile-edit-form" onSubmit={handleSubmit}>
        <fieldset className="settings-form-section" disabled={!choices.basics}>
          <legend>Household basics</legend>
          {!choices.basics ? <p className="category-disabled-note">This category is not currently allowed.</p> : null}
          <div className="field">
            <label htmlFor="edit-name">Name <span>Optional</span></label>
            <input id="edit-name" name="name" autoComplete="name" defaultValue={profile.name} />
          </div>
          <div className="field-grid">
            <div className="field">
              <label htmlFor="edit-age">Age <span>Optional</span></label>
              <input id="edit-age" name="age" type="number" inputMode="numeric" min="0" max="120" defaultValue={profile.age} />
            </div>
            <div className="field">
              <label htmlFor="edit-household-size">Household size <span>Optional</span></label>
              <input id="edit-household-size" name="householdSize" type="number" inputMode="numeric" min="1" max="20" defaultValue={profile.householdSize} />
            </div>
          </div>
        </fieldset>

        <fieldset className="settings-form-section" disabled={!choices.dependants}>
          <legend>Children and pets</legend>
          {!choices.dependants ? <p className="category-disabled-note">This category is not currently allowed.</p> : null}
          <div className="field">
            <label htmlFor="edit-children">Children under 15 <span>Optional</span></label>
            <input id="edit-children" name="childrenUnder15" type="number" inputMode="numeric" min="0" max="20" defaultValue={profile.childrenUnder15} />
          </div>
          <label className="check-row"><input type="checkbox" name="hasPets" value="yes" defaultChecked={profile.hasPets} /> Our household has pets</label>
        </fieldset>

        <fieldset className="settings-form-section" disabled={!choices.needs}>
          <legend>Health and accessibility</legend>
          {!choices.needs ? <p className="category-disabled-note">This category is not currently allowed.</p> : null}
          <div className="field">
            <label htmlFor="edit-accessibility">Accessibility needs <span>Optional</span></label>
            <input id="edit-accessibility" name="accessibilityNeeds" defaultValue={profile.accessibilityNeeds?.join(', ')} />
            <p className="field-help">Separate multiple needs with commas.</p>
          </div>
          <div className="field">
            <label htmlFor="edit-health">Health needs <span>Optional</span></label>
            <input id="edit-health" name="healthNeeds" defaultValue={profile.healthNeeds?.join(', ')} />
            <p className="field-help">For example, medication needs refrigeration.</p>
          </div>
        </fieldset>

        <fieldset className="settings-form-section">
          <legend>Location</legend>
          <div className="field">
            <label htmlFor="edit-postcode">Postcode <strong>Required</strong></label>
            <input aria-describedby={postcodeError ? 'edit-postcode-error' : 'edit-postcode-help'} aria-invalid={Boolean(postcodeError)} id="edit-postcode" name="postcode" inputMode="numeric" autoComplete="postal-code" maxLength={4} defaultValue={profile.postcode} required />
            {postcodeError ? <p className="field-error" id="edit-postcode-error" role="alert">{postcodeError}</p> : <p className="field-help" id="edit-postcode-help">Used to organise nearby information. Exact location is not needed.</p>}
          </div>
        </fieldset>

        {message ? <p className="inline-status" role="status" aria-live="polite">{message}</p> : null}
        {storageError ? <p className="field-error" role="alert">{storageError}</p> : null}
        <button className="button button--primary" type="submit">Save profile changes</button>
      </form>
    </section>
  )
}
