import type { CrisisPackNearbyPage } from '../buildCrisisPack'

export function PackNearbyPage({ page }: { page: CrisisPackNearbyPage }) {
  return (
    <>
      <header className="pack-page__header">
        <h2 className="pack-page__title">{page.title}</h2>
        <p className="pack-page__area">{page.areaHeading}</p>
      </header>
      <p className="pack-nearby__emergency"><strong>{page.emergencyLine}</strong></p>
      {page.staleNotice ? <p className="pack-nearby__notice">{page.staleNotice}</p> : null}
      <div className="pack-places-area">
        <div className="pack-place-columns pack-place-columns--2">
          {page.groups.map((group) => (
            <section className="pack-place-column" key={group.id}>
              <h3>{group.title}</h3>
              {group.message ? (
                <p className="pack-place-column__message">{group.message}</p>
              ) : (
                <ol>
                  {group.places.map((place) => (
                    <li key={place.id}>
                      <span className="pack-place__name">{place.name}</span>
                      {place.detail ? <span className="pack-place__detail">{place.detail}</span> : null}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ))}
        </div>
        {page.freshnessNote ? <p className="pack-freshness-note">{page.freshnessNote}</p> : null}
      </div>
    </>
  )
}
