import type { ReactNode } from 'react'
import { CRISIS_PACK_FOOTER_LABEL, type CrisisPackPage } from '../buildCrisisPack'

export function PackPageFrame({ page, children }: { page: CrisisPackPage; children: ReactNode }) {
  return (
    <section className="pack-page" aria-label={`Page ${page.pageNumber} of ${page.totalPages}: ${page.label}`}>
      <div className="pack-page__sheet">
        <div className="pack-page__body">{children}</div>
        <footer className="pack-page__footer">
          <span>{CRISIS_PACK_FOOTER_LABEL}</span>
          <span>{page.pageNumber} of {page.totalPages}</span>
        </footer>
      </div>
    </section>
  )
}
