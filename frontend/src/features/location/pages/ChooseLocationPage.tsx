import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { MapPin } from '@phosphor-icons/react'
import { appRoutes } from '../../../app/config/product'
import { getSearchLocation, getSearchPostcode, saveSearchLocation } from '../../../storage/searchLocationStorage'
import { resolveCoordinates, searchLocations } from '../../map/data/locationSearchApi'
import {
  readBrowserPosition,
} from '../resolveSearchLocation'

function nextPath(raw: string | null): string {
  if (!raw || !raw.startsWith('/')) return appRoutes.map
  if (raw.startsWith('//')) return appRoutes.map
  return raw
}

export function ChooseLocationPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const destination = nextPath(params.get('next'))
  const currentLocation = getSearchLocation()
  const currentPostcode = getSearchPostcode()
  const [query, setQuery] = useState(currentPostcode)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<'geo' | 'search' | null>(null)

  async function finish(postcode: string, label: string) {
    if (!saveSearchLocation({ postcode, label })) {
      setError('This browser could not save your search area. Check storage settings and try again.')
      return
    }
    navigate(destination, {
      replace: true,
      state: { searchPostcode: postcode, searchUpdatedAt: Date.now() },
    })
  }

  async function handleUseLocation() {
    setError('')
    setBusy('geo')
    try {
      const position = await readBrowserPosition()
      const resolved = await resolveCoordinates(
        position.coords.latitude,
        position.coords.longitude,
      )
      await finish(resolved.postcode, resolved.label)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'We could not use your current location. Enter a postcode instead.')
    } finally {
      setBusy(null)
    }
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setBusy('search')
    try {
      const matches = await searchLocations(query)
      if (matches.length === 0) {
        setError('No matching Victorian area was found. Check the spelling or enter a postcode.')
        return
      }
      if (matches.length > 1) {
        setError('More than one area matched. Enter a Victorian postcode to choose the right area.')
        return
      }
      const resolved = matches[0]
      await finish(resolved.postcode, resolved.label)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'We could not use that search. Try a four-digit postcode.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="location-page" aria-labelledby="location-title">
      <h1 id="location-title">Find places near you</h1>
      <p className="lead">Choose a search area for nearby Wi-Fi or support services.</p>
      {currentPostcode ? (
        <p className="current-search-location" role="status">
          Current search area: <strong>{currentLocation?.label ?? currentPostcode}</strong>
        </p>
      ) : null}

      <button
        className="button button--primary"
        type="button"
        onClick={() => void handleUseLocation()}
        disabled={busy !== null}
      >
        <MapPin aria-hidden="true" size={18} weight="bold" />
        {busy === 'geo' ? 'Finding your area…' : 'Use my current location'}
      </button>

      <p className="location-or" role="separator"><span>or</span></p>

      <form className="location-search" onSubmit={(event) => void handleSearch(event)}>
        <label htmlFor="location-query">Suburb or postcode</label>
        <div className="location-search__row">
          <input
            id="location-query"
            name="location"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="postal-code"
            placeholder="e.g. Harcourt or 3453"
            aria-invalid={Boolean(error)}
            aria-describedby="location-privacy"
            disabled={busy !== null}
          />
          <button className="button button--primary" type="submit" disabled={busy !== null}>
            {busy === 'search' ? 'Searching…' : 'Search'}
          </button>
        </div>
      </form>

      {error ? <p className="field-error" role="alert">{error}</p> : null}
      <p className="location-privacy" id="location-privacy">
        Your chosen area is saved on this device. If you use your current location, it is sent to our location service only to identify the nearby area.
      </p>
    </section>
  )
}
