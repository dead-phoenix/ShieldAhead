import { useState } from 'react'
import { Link } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import {
  clearOnboardingDraft,
  getOnboardingDraft,
} from '../../../storage/onboardingDraftStorage'
import { StatusBanner } from '../../../shared/components/StatusBanner'

export function SettingsPage() {
  const [hasDraft, setHasDraft] = useState(Boolean(getOnboardingDraft()))
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  function deleteDraft() {
    clearOnboardingDraft()
    setHasDraft(false)
    setConfirmingDelete(false)
  }

  return (
    <section className="content-page" aria-labelledby="settings-title">
      <h1 id="settings-title">My data</h1>
      <p className="lead">
        Review what this prototype stores locally. No account or cloud profile
        is created.
      </p>

      <StatusBanner title="On-device storage">
        <p>
          {hasDraft
            ? 'A household setup draft is stored in this browser.'
            : 'No household setup draft is currently stored.'}
        </p>
      </StatusBanner>

      {hasDraft ? (
        <section className="danger-zone" aria-labelledby="delete-title">
          <h2 id="delete-title">Delete setup draft</h2>
          <p>This removes the current draft from this browser.</p>
          {confirmingDelete ? (
            <div className="confirm-actions">
              <p>Delete this draft now?</p>
              <button className="button button--danger" type="button" onClick={deleteDraft}>
                Yes, delete draft
              </button>
              <button
                className="button button--quiet"
                type="button"
                onClick={() => setConfirmingDelete(false)}
              >
                Keep draft
              </button>
            </div>
          ) : (
            <button
              className="button button--danger-outline"
              type="button"
              onClick={() => setConfirmingDelete(true)}
            >
              Delete setup draft
            </button>
          )}
        </section>
      ) : (
        <Link className="button button--primary" to={appRoutes.setup}>
          Start device setup
        </Link>
      )}
    </section>
  )
}
