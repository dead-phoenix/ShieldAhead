import { Heart } from '@phosphor-icons/react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import {
  removeSavedPlace,
  SAVED_PLACES_LIMIT,
  savePlace,
  type SavedPlaceInput,
} from '../../../storage/savedPlacesStorage'
import { useSavedPlaces } from '../useSavedPlaces'
import '../SavedPlaces.css'

type Message = { text: string; showLink: boolean }

/**
 * Heart toggle for one place. Saving is local only: nothing is sent anywhere.
 * Renders the button and its status line as siblings so the caller's layout
 * can put the status on its own row.
 */
export function SavePlaceButton({ place }: { place: SavedPlaceInput }) {
  const savedPlaces = useSavedPlaces()
  const isSaved = savedPlaces.some((saved) => saved.key === place.key)
  const [message, setMessage] = useState<Message | null>(null)
  const name = place.record.name
  const label = isSaved ? `Remove ${name} from saved places` : `Save ${name} for offline use`

  function toggle() {
    if (isSaved) {
      setMessage(removeSavedPlace(place.key)
        ? { text: 'Removed from saved places', showLink: false }
        : { text: 'This place could not be removed. Check browser storage settings.', showLink: false })
      return
    }
    const result = savePlace(place)
    if (result === 'saved') setMessage({ text: 'Saved for offline use', showLink: true })
    else if (result === 'full') setMessage({ text: `You've saved ${SAVED_PLACES_LIMIT} places. Remove one on Saved places to add another.`, showLink: true })
    else setMessage({ text: 'This place could not be saved. Check browser storage settings.', showLink: false })
  }

  return (
    <>
      <button
        className={`save-place-button${isSaved ? ' is-saved' : ''}`}
        type="button"
        aria-pressed={isSaved}
        aria-label={label}
        title={label}
        onClick={toggle}
      >
        <Heart aria-hidden="true" size={24} weight={isSaved ? 'fill' : 'regular'} />
      </button>
      <p className="save-place-status" role="status" aria-live="polite">
        {message ? (
          <>
            {message.text}
            {message.showLink ? <> · <Link to={appRoutes.saved}>View saved places</Link></> : null}
          </>
        ) : null}
      </p>
    </>
  )
}
