import { useId, useState, type FormEvent } from 'react'
import type { MyArea } from '../../../data/contracts'
import { LocalOnlyNote } from '../../../shared/components/LocalOnlyNote'
import { saveMyArea } from '../../../storage/myAreaStorage'
import { LocalityPicker } from './LocalityPicker'
import { useAreaLocalityChoice } from './useAreaLocalityChoice'

interface MyAreaFormProps {
  label: string
  submitLabel: string
  initialPostcode?: string
  onSaved: (area: MyArea) => void
}

export function MyAreaForm({ label, submitLabel, initialPostcode = '', onSaved }: MyAreaFormProps) {
  const id = useId()
  const [error, setError] = useState('')
  const locality = useAreaLocalityChoice()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const formData = new FormData(event.currentTarget)
    const postcode = String(formData.get('postcode') ?? '').trim()
    if (!/^\d{4}$/.test(postcode)) {
      setError('Enter a four-digit Australian postcode, such as 3453.')
      return
    }
    const chosen = await locality.resolve(postcode, formData)
    if (!chosen) return
    const area = saveMyArea(chosen)
    if (!area) {
      setError('My area could not be saved. Check browser storage settings and try again.')
      return
    }
    onSaved(area)
  }

  return (
    <form className="form-stack my-area-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
      <div className="field">
        <label htmlFor={`${id}-postcode`}>{label}</label>
        <input
          aria-describedby={error ? `${id}-error` : undefined}
          aria-invalid={Boolean(error)}
          autoComplete="postal-code"
          defaultValue={initialPostcode}
          id={`${id}-postcode`}
          inputMode="numeric"
          maxLength={4}
          name="postcode"
          onChange={(event) => {
            if (locality.choices && event.target.value.trim() !== locality.choices.postcode) locality.reset()
          }}
          required
        />
        {error ? <p className="field-error" id={`${id}-error`} role="alert">{error}</p> : null}
      </div>
      {locality.choices ? <LocalityPicker choices={locality.choices} error={locality.choiceError} /> : null}
      <LocalOnlyNote variant="postcode" />
      <button className="button button--primary" type="submit" disabled={locality.isChecking}>{submitLabel}</button>
    </form>
  )
}
