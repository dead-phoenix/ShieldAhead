import { MapPin, Phone } from '@phosphor-icons/react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import type { OfflineServiceCategory } from '../../../data/offlineData'
import {
  isInRegion,
  rankNearby,
  readNearbySnapshot,
  refreshNearbySnapshot,
  snapshotMatchesArea,
  subscribeToNearbySnapshot,
  type NearbySnapshot,
} from '../../../data/offline/nearbySnapshot'
import { loadOfflineDataBundle } from '../../../data/offline/offlineDataLoader'
import { useOnlineStatus } from '../../../shared/hooks/useOnlineStatus'
import type { LatLng } from '../../../shared/utils/geo'
import { getMyArea, MY_AREA_CHANGED_EVENT } from '../../../storage/myAreaStorage'
import { NearbyServiceList } from '../components/NearbyServiceList'
import { formatNearbyDate, nearbyCopy } from '../nearbyCopy'
import { useCurrentPosition } from '../useCurrentPosition'
import './NearbyPage.css'

type LiveData = Pick<NearbySnapshot, 'records' | 'region'>
type LiveDataState = { status: 'none' } | { status: 'loading' } | { status: 'failed' } | { status: 'ready'; data: LiveData }

function useMyArea() {
  const [area, setArea] = useState(getMyArea)
  useEffect(() => {
    const update = () => setArea(getMyArea())
    window.addEventListener(MY_AREA_CHANGED_EVENT, update)
    return () => window.removeEventListener(MY_AREA_CHANGED_EVENT, update)
  }, [])
  return area
}

// The Map's own category naming ("support") differs from the offline data's
// ("charity") for this one category — everything else is a 1:1 match.
const CATEGORY_PARAM_TO_OFFLINE: Record<string, OfflineServiceCategory> = {
  wifi: 'wifi',
  hospital: 'hospital',
  police: 'police',
  fire: 'fire',
  ambulance: 'ambulance',
  support: 'charity',
}

function RegionNotice({ regionName }: { regionName: string }) {
  return <p className="nearby-notice nearby-notice--warning" role="alert">{nearbyCopy.outOfRegion(regionName)}</p>
}

export function NearbyPage() {
  const [searchParams] = useSearchParams()
  const onlyCategory = CATEGORY_PARAM_TO_OFFLINE[searchParams.get('category') ?? '']
  const snapshot = useSyncExternalStore(subscribeToNearbySnapshot, readNearbySnapshot, () => null)
  const myArea = useMyArea()
  const isOnline = useOnlineStatus()
  const position = useCurrentPosition()
  const [liveData, setLiveData] = useState<LiveDataState>({ status: 'none' })
  const [buildFailed, setBuildFailed] = useState(false)

  const isStale = Boolean(snapshot && myArea && !snapshotMatchesArea(snapshot, myArea))
  const needsBuild = Boolean(myArea && (!snapshot || isStale))

  useEffect(() => {
    if (!isOnline || !needsBuild) return
    let isCurrent = true
    refreshNearbySnapshot().then(
      () => { if (isCurrent) setBuildFailed(false) },
      () => { if (isCurrent) setBuildFailed(true) },
    )
    return () => {
      isCurrent = false
    }
  }, [isOnline, needsBuild, myArea?.postcode, myArea?.localityId])

  async function loadLiveData() {
    if (!navigator.onLine) {
      setLiveData({ status: 'failed' })
      return
    }
    setLiveData({ status: 'loading' })
    try {
      const bundle = await loadOfflineDataBundle()
      const records = [bundle.emergencyServices, bundle.wifi, bundle.charities].flatMap((file) => file.records)
      setLiveData({ status: 'ready', data: { records, region: bundle.emergencyServices.region } })
    } catch {
      setLiveData({ status: 'failed' })
    }
  }

  function locateMe() {
    position.request(() => {
      if (!readNearbySnapshot() && liveData.status !== 'ready') void loadLiveData()
    })
  }

  const liveSource: LiveData | null = snapshot ?? (liveData.status === 'ready' ? liveData.data : null)
  const livePoint: LatLng | null = position.state.status === 'found' ? position.state.point : null
  const livePointInRegion = livePoint && liveSource ? isInRegion(livePoint, liveSource.region) : null
  const areaOutOfRegion = Boolean(snapshot && !snapshot.originInRegion)
  const regionName = liveSource?.region.name ?? snapshot?.region.name ?? ''
  const showRegionNoticeInLive = livePoint !== null && liveSource !== null && (livePointInRegion === false || areaOutOfRegion)
  const showRegionNoticeInSaved = !showRegionNoticeInLive && areaOutOfRegion
  const savedOn = snapshot ? formatNearbyDate(snapshot.builtAt) : undefined

  return (
    <section className="content-page nearby-page" aria-labelledby="nearby-title">
      <div className="page-heading">
        <div>
          <h1 id="nearby-title">{nearbyCopy.pageTitle}</h1>
          <p>{nearbyCopy.intro}</p>
        </div>
      </div>
      <p className="nearby-emergency"><Phone aria-hidden="true" size={20} weight="fill" /> <strong>{nearbyCopy.emergency}</strong></p>

      <section className="nearby-live" aria-label="Your current location">
        <button className="button button--primary" type="button" onClick={locateMe} disabled={position.state.status === 'locating'}>
          <MapPin aria-hidden="true" size={18} /> {nearbyCopy.gps.button}
        </button>
        <p className="field-help">{nearbyCopy.gps.privacy}</p>
        {position.state.status === 'locating' ? <p className="inline-status" role="status">{nearbyCopy.gps.locating}</p> : null}
        {position.state.status === 'error' ? <p className="nearby-notice" role="alert">{nearbyCopy.gps[position.state.reason]}</p> : null}
        {livePoint && !liveSource && liveData.status === 'loading' ? <p className="inline-status" role="status">{nearbyCopy.gps.locating}</p> : null}
        {livePoint && !liveSource && liveData.status === 'failed' ? <p className="nearby-notice" role="alert">{nearbyCopy.gps.noData}</p> : null}
        {showRegionNoticeInLive ? <RegionNotice regionName={regionName} /> : null}
        {livePoint && liveSource && livePointInRegion ? (
          <NearbyServiceList heading={nearbyCopy.liveListHeading} lists={rankNearby(liveSource.records, livePoint)} onlyCategory={onlyCategory} />
        ) : null}
      </section>

      <section className="nearby-saved" aria-label="Saved for My area">
        {isStale && snapshot && myArea ? (
          <p className="nearby-notice nearby-notice--warning" role="alert">{nearbyCopy.staleArea(snapshot.originLabel, myArea.label)}</p>
        ) : null}
        {showRegionNoticeInSaved ? <RegionNotice regionName={regionName} /> : null}
        {snapshot ? (
          <>
            {snapshot.originInRegion ? (
              <NearbyServiceList
                heading={isStale ? nearbyCopy.staleListHeading(snapshot.originLabel) : nearbyCopy.savedListHeading(snapshot.originLabel)}
                lists={snapshot.nearest}
                onlyCategory={onlyCategory}
              />
            ) : null}
            {savedOn ? <p className="nearby-freshness">{nearbyCopy.savedOn(savedOn)}</p> : null}
            {snapshot.attributions.length > 0 ? (
              <details className="nearby-sources">
                <summary>{nearbyCopy.sourcesTitle}</summary>
                <ul>{snapshot.attributions.map((attribution) => <li key={attribution}>{attribution}</li>)}</ul>
              </details>
            ) : null}
          </>
        ) : myArea ? (
          <p className="inline-status" role="status">{isOnline && !buildFailed ? nearbyCopy.saving(myArea.label) : nearbyCopy.notSavedYet}</p>
        ) : (
          <p className="nearby-empty">
            {nearbyCopy.noArea} <Link to={appRoutes.myArea}>{nearbyCopy.setArea}</Link>
          </p>
        )}
      </section>
    </section>
  )
}
