import type { CrisisPackContactsPage } from '../buildCrisisPack'

export function PackContactsPage({ page }: { page: CrisisPackContactsPage }) {
  return (
    <>
      <header className="pack-page__header">
        <h2 className="pack-page__title">{page.title}</h2>
      </header>

      <table className="pack-contacts-table">
        <thead>
          <tr>
            {page.columns.map((column) => <th key={column} scope="col">{column}</th>)}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: page.rowCount }, (_, row) => (
            <tr key={row}>
              {page.columns.map((column) => <td key={column} />)}
            </tr>
          ))}
        </tbody>
      </table>

      <p className="pack-write-line"><span>{page.meetingPlaceLabel}</span></p>
      <p className="pack-write-line"><span>{page.outsideContactLabel}</span></p>
    </>
  )
}
