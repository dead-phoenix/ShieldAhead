import { useState } from 'react'
import { appRoutes } from '../../../app/config/product'
import { PageBackLink } from '../../../shared/components/PageBackLink'
import { formatSavedDate } from '../../../shared/utils/formatDate'
import { getMyArea } from '../../../storage/myAreaStorage'
import { MyAreaForm } from '../components/MyAreaForm'

export function MyAreaPage() {
  const [area, setArea] = useState(getMyArea)
  const [message, setMessage] = useState('')

  return (
    <section className="flow-page settings-flow-page" aria-labelledby="my-area-page-title">
      <PageBackLink to={appRoutes.settings}>Back to profile</PageBackLink>
      <h1 id="my-area-page-title">My area</h1>
      <p className="lead">Your crisis pack is built for this area. Searching the map for somewhere else does not change it.</p>
      <dl className="review-list">
        <div><dt>Current area</dt><dd>{area ? area.label : 'Not set'}</dd></div>
        {area?.savedAt ? <div><dt>Saved</dt><dd>{formatSavedDate(area.savedAt)}</dd></div> : null}
      </dl>
      <MyAreaForm
        key={area?.savedAt ?? 'unset'}
        initialPostcode={area?.postcode}
        label="Postcode"
        submitLabel={area ? 'Change My area' : 'Save My area'}
        onSaved={(saved) => {
          setArea(saved)
          setMessage(`My area is now ${saved.label}.`)
        }}
      />
      {message ? <p className="inline-status" role="status" aria-live="polite">{message}</p> : null}
    </section>
  )
}
