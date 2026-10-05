import type { CrisisPackChecklistPage } from '../buildCrisisPack'

export function PackChecklistPage({ page }: { page: CrisisPackChecklistPage }) {
  return (
    <>
      <header className="pack-page__header">
        <h2 className="pack-page__title">{page.title}</h2>
        <p className="pack-page__subtitle">{page.subtitle}</p>
      </header>

      {page.groups.map((group) => (
        <section className="pack-task-group" key={group.id}>
          <h3>{group.title}</h3>
          <ul className="pack-tick-list">
            {group.tasks.map((task) => (
              <li key={task.id}>
                <span className="pack-tick-box" aria-hidden="true" />
                <span>
                  <strong className="pack-task__title">{task.title}</strong>
                  {task.description ? <small className="pack-task__description">{task.description}</small> : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div className="pack-guidelines">
        <section className="pack-guidelines__column pack-guidelines__column--do">
          <h3>{page.guidelines.dosTitle}</h3>
          <ul>
            {page.guidelines.dos.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
        <section className="pack-guidelines__column pack-guidelines__column--dont">
          <h3>{page.guidelines.dontsTitle}</h3>
          <ul>
            {page.guidelines.donts.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      </div>

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
