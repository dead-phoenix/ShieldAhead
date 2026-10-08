import { useState } from 'react'
import { lookupLocalities } from '../../../data/offline/offlineDataLoader'
import type { LocalityRecord } from '../../../data/offlineData'

export interface ChosenArea {
  postcode: string
  localityId?: string
  localityName?: string
}

export interface LocalityChoices {
  postcode: string
  localities: LocalityRecord[]
}

export const LOCALITY_FIELD_NAME = 'locality'
/** Radio value for "use the postcode only". */
export const POSTCODE_ONLY_VALUE = 'postcode-only'

/**
 * Turns a submitted postcode into a My area: one matching suburb is used
 * directly, several ask the household to pick (or keep the postcode only),
 * and none (or no data, e.g. offline) keeps the postcode only.
 */
export function useAreaLocalityChoice() {
  const [choices, setChoices] = useState<LocalityChoices | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [choiceError, setChoiceError] = useState('')

  function reset() {
    setChoices(null)
    setChoiceError('')
  }

  /** Null while the household still has to pick a suburb. */
  async function resolve(postcode: string, formData: FormData): Promise<ChosenArea | null> {
    setChoiceError('')
    if (choices?.postcode === postcode) {
      const selected = formData.get(LOCALITY_FIELD_NAME)
      if (selected === null) {
        setChoiceError('Choose your suburb, or choose to use the postcode only.')
        return null
      }
      const locality = choices.localities.find((item) => item.id === selected)
      return locality ? { postcode, localityId: locality.id, localityName: locality.name } : { postcode }
    }

    setIsChecking(true)
    const localities = await lookupLocalities(postcode)
    setIsChecking(false)
    if (localities && localities.length > 1) {
      setChoices({ postcode, localities })
      return null
    }
    setChoices(null)
    const [only] = localities ?? []
    return only ? { postcode, localityId: only.id, localityName: only.name } : { postcode }
  }

  return { choices, choiceError, isChecking, reset, resolve }
}
