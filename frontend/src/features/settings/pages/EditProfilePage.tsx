import { LockKey } from '@phosphor-icons/react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import type { HouseholdProfile } from '../../../data/contracts'
import { LocalOnlyNote } from '../../../shared/components/LocalOnlyNote'
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
  const [message, setMessage] = useState('')
  const [storageError, setStorageError] = useState('')

  if (!profile) return <Navigate replace to={appRoutes.settings} />

  const choices = {
    dependants: consent?.optionalCategories.dependants ?? true,
    needs: consent?.optionalCategories.needs ?? true,
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    setStorageError('')
    const formData = new FormData(event.currentTarget)

    const updatedProfile: HouseholdProfile = {
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
      setStorageError('Your details could not be saved. Check browser storage settings and try again.')
      return
    }
    setMessage('Your household notes were updated on this device.')
  }

  return (
    <section className="flow-page settings-flow-page" aria-labelledby="edit-profile-title">
      <PageBackLink to={appRoutes.settings}>Back to profile</PageBackLink>
      <h1 id="edit-profile-title">Edit household notes</h1>
      <p className="lead">Optional notes about your household, kept on this device. To change the area your crisis pack is built for, use <Link to={appRoutes.myArea}>My area</Link>.</p>

      <div className="privacy-card edit-consent-note"><LockKey aria-hidden="true" size={22} /><p>Fields in a category you have not allowed remain unavailable. <Link to={appRoutes.consentSettings}>Change consent choices</Link> first if you want to add them.</p></div>

      <form className="form-stack profile-edit-form" onSubmit={handleSubmit}>
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

        <LocalOnlyNote variant="no-postcode" />
        {message ? <p className="inline-status" role="status" aria-live="polite">{message}</p> : null}
        {storageError ? <p className="field-error" role="alert">{storageError}</p> : null}
        <button className="button button--primary" type="submit">Save changes</button>
      </form>
    </section>
  )
}
