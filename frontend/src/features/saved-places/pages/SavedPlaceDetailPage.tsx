import { Clock, HandHeart, LinkSimple, MapPin, NavigationArrow, Phone, WifiHigh } from '@phosphor-icons/react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { EmptyState } from '../../../shared/components/EmptyState'
import { PageBackLink } from '../../../shared/components/PageBackLink'
import { useOnlineStatus } from '../../../shared/hooks/useOnlineStatus'
import { formatSavedDate } from '../../../shared/utils/formatDate'
import { openMapUrl } from '../../../shared/utils/openMapUrl'
import { getSavedPlace, type SavedPlaceRecord } from '../../../storage/savedPlacesStorage'
import { mapPlaceKindPresentation } from '../../map/model/mapPlacePresentation'
import { SavedOnNotice } from '../components/SavedOnNotice'
import { SavePlaceButton } from '../components/SavePlaceButton'
import { savedPlaceLocality } from '../savedPlaceRecords'
import { useSavedPlaces } from '../useSavedPlaces'
import '../SavedPlaces.css'

function addressText(record: SavedPlaceRecord): string {
  const locality = savedPlaceLocality(record)
  if (record.address) return [record.address, locality].filter(Boolean).join(', ')
  return locality ? `Street address not confirmed. Listed for ${locality}.` : 'Street address not confirmed.'
}

/** One view for every hearted place, read only from the saved record, so it opens offline. */
export function SavedPlaceDetailPage() {
  const { key = '' } = useParams()
  const savedPlaces = useSavedPlaces()
  const [openedWith] = useState(() => getSavedPlace(key))
  const place = savedPlaces.find((saved) => saved.key === key) ?? openedWith
  const isOnline = useOnlineStatus()

  if (!place) {
    return (
      <section className="detail-page">
        <PageBackLink to={appRoutes.saved}>Back to saved places</PageBackLink>
        <EmptyState
          title="This place is not in your saved places"
          action={<Link className="button button--primary" to={appRoutes.saved}>View saved places</Link>}
        >
          <p>It may have been removed, or everything saved on this device was deleted.</p>
        </EmptyState>
      </section>
    )
  }

  const { record } = place
  const hasPoint = record.latitude != null && record.longitude != null
  const mapsUrl = openMapUrl({ latitude: record.latitude, longitude: record.longitude, query: `${record.name} ${savedPlaceLocality(record)}` })

  return (
    <section className="detail-page" aria-labelledby="saved-place-title">
      <PageBackLink to={appRoutes.saved}>Back to saved places</PageBackLink>
      <div className="page-heading page-heading--saveable">
        <div>
          <h1 id="saved-place-title">{record.name}</h1>
          <p>{mapPlaceKindPresentation[record.placeType].singularLabel}</p>
        </div>
        <SavePlaceButton place={{ key: place.key, kind: place.kind, record }} />
      </div>
      <SavedOnNotice savedAt={place.savedAt} />
      <dl className="detail-list">
        <div><dt><MapPin aria-hidden="true" size={20} /> Address</dt><dd>{addressText(record)}</dd></div>
        <div><dt><Phone aria-hidden="true" size={20} /> Phone</dt><dd>{record.phone ? <a href={`tel:${record.phone}`}>{record.phone}</a> : 'Phone not published'}</dd></div>
        {record.openingHours ? <div><dt><Clock aria-hidden="true" size={20} /> Opening hours</dt><dd>{record.openingHours}</dd></div> : null}
        {record.accessConditions?.length ? <div><dt><WifiHigh aria-hidden="true" size={20} /> Access conditions</dt><dd><ul>{record.accessConditions.map((condition) => <li key={condition}>{condition}</li>)}</ul></dd></div> : null}
        {record.serviceTypes?.length ? <div><dt><HandHeart aria-hidden="true" size={20} /> Published information may indicate</dt><dd><ul>{record.serviceTypes.map((type) => <li key={type}>{type}</li>)}</ul></dd></div> : null}
        {record.eligibility ? <div><dt>Eligibility</dt><dd>{record.eligibility}</dd></div> : null}
        {record.accessPoints?.length ? <div><dt><WifiHigh aria-hidden="true" size={20} /> Access points</dt><dd><ul>{record.accessPoints.map((point) => <li key={point.name}>{point.name}</li>)}</ul></dd></div> : null}
        {record.website ? <div><dt><LinkSimple aria-hidden="true" size={20} /> Website</dt><dd>{isOnline ? <a href={record.website} target="_blank" rel="noreferrer">Open organisation website</a> : 'Needs an internet connection'}</dd></div> : null}
        <div><dt>Data updated</dt><dd>{formatSavedDate(record.dataUpdatedAt)}</dd></div>
      </dl>
      <div className="detail-actions">
        {!hasPoint ? (
          <p className="directions-warning">Directions are unavailable because this record has no confirmed map coordinates.</p>
        ) : isOnline ? (
          <a className="button button--primary" href={mapsUrl} target="_blank" rel="noreferrer"><NavigationArrow aria-hidden="true" size={20} /> Open in maps</a>
        ) : (
          <>
            <button className="button button--primary" type="button" disabled><NavigationArrow aria-hidden="true" size={20} /> Open in maps</button>
            <p className="field-help">Needs an internet connection</p>
          </>
        )}
      </div>
    </section>
  )
}
