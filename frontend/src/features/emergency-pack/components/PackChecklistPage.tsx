import type { CrisisPackChecklistPage } from '../buildCrisisPack'

export function PackChecklistPage({ page }: { page: CrisisPackChecklistPage }) {
  return (
    <>
      <header className="pack-page__header">
        <h2 className="pack-page__title">{page.title}</h2>
        <p className="pack-page__subtitle">{page.subtitle}</p>
      </header>

      <ul className="pack-tick-list">
        {page.tasks.map((task) => (
          <li key={task.id}>
            <span className="pack-tick-box" aria-hidden="true" />
            <span>{task.title}</span>
          </li>
        ))}
      </ul>

      {page.sources.length > 0 ? (
        <section className="pack-sources">
          <h3>{page.sourcesTitle}</h3>
          <ul>
            {page.sources.map((source) => (
              <li key={`${source.label}|${source.url}`}>{source.label}: {source.url}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  )
}
