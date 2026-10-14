import { placeColumnMapKind, type CrisisPackGetHelpPage } from '../buildCrisisPack'
import type { CrisisPackStreetMapState } from '../useCrisisPackMap'
import { PackMarkerGlyph, PackPlacesMap } from './PackPlacesMap'

export function PackGetHelpPage({ page, streetMap }: { page: CrisisPackGetHelpPage; streetMap?: CrisisPackStreetMapState }) {
  const hasPlaces = page.placeColumns.some((column) => column.places.length > 0)
  return (
    <>
      <header className="pack-page__header">
        <h2 className="pack-page__title">{page.title}</h2>
        {page.areaLine ? <p className="pack-page__area">{page.areaLine}</p> : null}
        <p className="pack-write-line"><span>{page.nameAndDateLabel}</span></p>
      </header>

      {page.helplines ? (
        <section className="pack-helpline-strip">
          <h3>{page.helplinesTitle}</h3>
          <ul>
            {page.helplines.map((helpline) => (
              <li key={helpline.id}>
                <span className="pack-helpline-strip__name">{helpline.name}</span>
                <span className="pack-helpline-strip__phone">{helpline.phone}</span>
                {helpline.note ? <small>{helpline.note}</small> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {page.placeColumns.length > 0 ? (
        <div className={page.placesMap && hasPlaces ? 'pack-places-area pack-places-area--with-map' : 'pack-places-area'}>
          <div className={`pack-place-columns pack-place-columns--${page.placeColumns.length}`}>
            {page.placeColumns.map((column) => (
              <section className="pack-place-column" key={column.id}>
                <h3>{column.title}</h3>
                {column.message ? (
                  <p className="pack-place-column__message">{column.message}</p>
                ) : (
                  <ol className="pack-place-list--labelled">
                    {column.places.map((place) => (
                      <li key={place.id}>
                        <PackMarkerGlyph className="pack-place__marker" kind={placeColumnMapKind[column.id]} label={place.markerLabel} />
                        <span className="pack-place__text">
                          <span className="pack-place__name">{place.name}</span>
                          {place.detail ? <span className="pack-place__detail">{place.detail}</span> : null}
                          {place.mapNote ? <span className="pack-place__map-note">{place.mapNote}</span> : null}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            ))}
          </div>
          {page.placesMap && hasPlaces ? (
            <PackPlacesMap
              map={page.placesMap}
              streetMap={streetMap?.streetMap}
              streetMapFailed={streetMap?.status === 'failed'}
            />
          ) : null}
          {page.freshnessNote ? <p className="pack-freshness-note">{page.freshnessNote}</p> : null}
        </div>
      ) : null}
    </>
  )
}
