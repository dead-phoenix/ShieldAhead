import { useNavigate, useSearchParams } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { getSearchLocation, getSearchPostcode, saveSearchLocation } from '../../../storage/searchLocationStorage'
import { LocationSearchFields } from '../components/LocationSearchFields'

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

  function handleResolved(postcode: string, label: string): boolean {
    if (!saveSearchLocation({ postcode, label })) return false
    navigate(destination, {
      replace: true,
      state: { searchPostcode: postcode, searchUpdatedAt: Date.now() },
    })
    return true
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

      <LocationSearchFields initialQuery={currentPostcode} onResolved={handleResolved} />
    </section>
  )
}
