import { useId } from 'react'
import type { CrisisPack, CrisisPackPage } from '../buildCrisisPack'
import { PackChecklistPage } from './PackChecklistPage'
import { PackContactsPage } from './PackContactsPage'
import { PackGetHelpPage } from './PackGetHelpPage'
import { PackNearbyPage } from './PackNearbyPage'
import { PackPageFrame } from './PackPageFrame'
import './CrisisPackPreview.css'

function PackPageContent({ page }: { page: CrisisPackPage }) {
  switch (page.kind) {
    case 'get-help':
      return <PackGetHelpPage page={page} />
    case 'nearby':
      return <PackNearbyPage page={page} />
    case 'checklist':
      return <PackChecklistPage page={page} />
    case 'contacts':
      return <PackContactsPage page={page} />
  }
}

export function CrisisPackPreview({ pack }: { pack: CrisisPack }) {
  const summaryId = useId()
  return (
    <div className="crisis-pack-preview" role="region" aria-label="Crisis pack preview" aria-describedby={summaryId}>
      <p id={summaryId} className="crisis-pack-preview__summary" aria-live="polite">{pack.summary}</p>
      {pack.pages.map((page) => (
        <PackPageFrame key={page.id} page={page} builtForLine={pack.builtForLine}>
          <PackPageContent page={page} />
        </PackPageFrame>
      ))}
    </div>
  )
}
