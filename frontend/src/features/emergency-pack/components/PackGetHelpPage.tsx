import type { CrisisPackGetHelpPage } from '../buildCrisisPack'

export function PackGetHelpPage({ page }: { page: CrisisPackGetHelpPage }) {
  return (
    <>
      <header className="pack-page__header">
        <h2 className="pack-page__title">{page.title}</h2>
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
        <div className="pack-places-area">
          <div className={`pack-place-columns pack-place-columns--${page.placeColumns.length}`}>
            {page.placeColumns.map((column) => (
              <section className="pack-place-column" key={column.id}>
                <h3>{column.title}</h3>
                {column.message ? (
                  <p className="pack-place-column__message">{column.message}</p>
                ) : (
                  <ol>
                    {column.places.map((place) => (
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
      ) : null}
    </>
  )
}
