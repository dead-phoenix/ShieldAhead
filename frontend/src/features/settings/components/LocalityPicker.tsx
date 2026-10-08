import { useId } from 'react'
import { LOCALITY_FIELD_NAME, POSTCODE_ONLY_VALUE, type LocalityChoices } from './useAreaLocalityChoice'

export function LocalityPicker({ choices, error }: { choices: LocalityChoices; error: string }) {
  const id = useId()
  return (
    <fieldset
      className="field choice-field locality-picker"
      aria-describedby={error ? `${id}-error` : undefined}
      aria-invalid={Boolean(error)}
    >
      <legend>Which suburb in {choices.postcode}?</legend>
      {choices.localities.map((locality) => (
        <label className="check-row" key={locality.id}>
          <input type="radio" name={LOCALITY_FIELD_NAME} value={locality.id} /> {locality.name}
        </label>
      ))}
      <label className="check-row">
        <input type="radio" name={LOCALITY_FIELD_NAME} value={POSTCODE_ONLY_VALUE} /> Not sure. Use {choices.postcode} only
      </label>
      {error ? <p className="field-error" id={`${id}-error`} role="alert">{error}</p> : null}
    </fieldset>
  )
}
