import { MagnifyingGlass } from '@phosphor-icons/react'
import { lazy, Suspense, useCallback, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { crisisContent } from '../crisisContent'
import { matchCrisisKind } from '../matchCrisisQuery'

const AccordionGallery = lazy(() => import('../../../shared/components/AccordionGallery').then((module) => ({ default: module.AccordionGallery })))

export function CrisisLandingPage() {
  const [activeHazard, setActiveHazard] = useState(1)
  const handleActiveHazardChange = useCallback((index: number) => setActiveHazard(index), [])
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [searchError, setSearchError] = useState('')

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const kind = matchCrisisKind(query)
    if (!kind) {
      setSearchError("We couldn't match that to bushfire, flood, or power outage guidance. Choose a hazard below instead.")
      return
    }
    setSearchError('')
    navigate(appRoutes.crisisGuidance(kind))
  }

  return (
    <section className="content-page crisis-page" aria-labelledby="crisis-title">
      <div className="crisis-page__backdrop" aria-hidden="true">
        {crisisContent.map((item, index) => (
          <img
            alt=""
            className={index === activeHazard ? 'is-active' : undefined}
            key={item.kind}
            src={`/images/crisis/${item.kind}.webp`}
          />
        ))}
      </div>
      <header className="crisis-intro">
        <div><h1 id="crisis-title">Pre-crisis guidance</h1><p>Choose a hazard to review its preparation page and household checklist before an emergency occurs.</p></div>
      </header>
      <form className="crisis-query-search" onSubmit={handleSearch}>
        <label htmlFor="crisis-query-input">Ask a question, e.g. &quot;How should I prepare for bushfire&quot;</label>
        <div className="crisis-query-search__row">
          <input
            id="crisis-query-input"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="How should I prepare for bushfire?"
            type="text"
            value={query}
          />
          <button className="button button--primary" type="submit">
            <MagnifyingGlass aria-hidden="true" size={18} /> Search
          </button>
        </div>
        {searchError ? <p className="crisis-query-search__error" role="alert">{searchError}</p> : null}
      </form>
      <Suspense fallback={<p className="crisis-gallery-loading" role="status">Loading preparation topics…</p>}>
        <AccordionGallery
          defaultIndex={1}
          expandRatio={0.5}
          items={crisisContent.map((item) => ({
            image: `/images/crisis/${item.kind}.webp`,
            alt: item.kind === 'bushfire' ? 'Smoke rising over a bushfire area' : item.kind === 'flood' ? 'Floodwater covering a road' : 'A dark home during a power outage',
            label: item.title,
            description: item.summary,
            link: appRoutes.crisisDetail(item.kind),
          }))}
          onActiveChange={handleActiveHazardChange}
          trigger="hover"
        />
      </Suspense>
    </section>
  )
}
