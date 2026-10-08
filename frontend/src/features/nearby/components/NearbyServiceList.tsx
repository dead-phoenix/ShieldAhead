import type { NearbyLists } from '../../../data/offline/nearbySnapshot'
import {
  NEARBY_CATEGORY_ORDER,
  formatDistanceKm,
  isApproximateLocation,
  nearbyCategoryTitles,
  nearbyCopy,
  serviceDetail,
} from '../nearbyCopy'

export function NearbyServiceList({ heading, lists }: { heading: string; lists: NearbyLists }) {
  return (
    <section className="nearby-list" aria-label={heading}>
      <h2>{heading}</h2>
      {NEARBY_CATEGORY_ORDER.map((category) => {
        const records = lists[category] ?? []
        return (
          <section className="nearby-list__category" key={category} aria-label={nearbyCategoryTitles[category]}>
            <h3>{nearbyCategoryTitles[category]}</h3>
            {records.length === 0 ? (
              <p className="nearby-list__empty">{nearbyCopy.noneInCategory}</p>
            ) : (
              <ol>
                {records.map((record) => {
                  const detail = serviceDetail(record)
                  return (
                    <li key={record.id}>
                      <span className="nearby-list__name">{record.name}</span>
                      <span className="nearby-list__distance">{formatDistanceKm(record.distanceKm)}</span>
                      {detail ? <span className="nearby-list__detail">{detail}</span> : null}
                      {isApproximateLocation(record) ? <small>{nearbyCopy.approximateLocation}</small> : null}
                      {record.category === 'wifi' && record.verification === 'likely' ? <small>{nearbyCopy.wifiNotConfirmed}</small> : null}
                      {record.phone ? <a href={`tel:${record.phone.replace(/\s+/g, '')}`}>{record.phone}</a> : null}
                    </li>
                  )
                })}
              </ol>
            )}
          </section>
        )
      })}
    </section>
  )
}
