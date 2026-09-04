import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { MapPin } from '@phosphor-icons/react'
import { appRoutes } from '../../../app/config/product'
import { saveSearchLocation } from '../../../storage/searchLocationStorage'
import {
  LocationResolveError,
  parseManualLocationQuery,
  readBrowserPosition,
  resolveCurrentCoordinates,
  resolvePlaceName,
  resolvePostcodeLookup,
} from '../resolveSearchLocation'

function nextPath(raw: string | null): string {
  if (!raw) return appRoutes.wifi
  if (raw === appRoutes.wifi || raw.startsWith('/wifi/')) return raw
  if (raw === appRoutes.support || raw.startsWith('/support/')) return raw
  return appRoutes.wifi
}

export function ChooseLocationPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const destination = nextPath(params.get('next'))
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<'geo' | 'search' | null>(null)

  async function finish(postcode: string, label: string) {
    if (!saveSearchLocation({ postcode, label })) {
      setError('This browser could not save your search area. Check storage settings and try again.')
      return
    }
    navigate(destination, { replace: true })
  }

  async function handleUseLocation() {
    setError('')
    setBusy('geo')
    try {
      const position = await readBrowserPosition()
      const resolved = await resolveCurrentCoordinates(
        position.coords.latitude,
        position.coords.longitude,
      )
      await finish(resolved.postcode, resolved.label)
    } catch (caught) {
      setError(caught instanceof LocationResolveError
        ? caught.message
        : 'We could not use your current location. Enter a suburb or postcode instead.')
    } finally {
      setBusy(null)
    }
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const parsed = parseManualLocationQuery(query)
    if (!parsed) {
      setError('Enter a Victorian suburb or a four-digit postcode.')
      return
    }

    setBusy('search')
    try {
      const resolved = parsed.kind === 'postcode'
        ? await resolvePostcodeLookup(parsed.postcode)
        : await resolvePlaceName(parsed.query)
      await finish(resolved.postcode, resolved.label)
    } catch (caught) {
      setError(caught instanceof LocationResolveError
        ? caught.message
        : 'We could not use that search. Try a four-digit postcode.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="location-page" aria-labelledby="location-title">
      <h1 id="location-title">Find places near you</h1>
      <p className="lead">Choose a search area for nearby Wi-Fi and support services.</p>

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
        Your location stays on this device and is never sent to a server.
      </p>
    </section>
  )
}
