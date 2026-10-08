import { lazy, Suspense, useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { LazyLoadBoundary } from '../../../shared/components/LazyLoadBoundary'
import { crisisContent } from '../crisisContent'
import { CrisisQuerySearch } from '../components/CrisisQuerySearch'

const AccordionGallery = lazy(() => import('../../../shared/components/AccordionGallery').then((module) => ({ default: module.AccordionGallery })))

export function CrisisLandingPage() {
  const [activeHazard, setActiveHazard] = useState(1)
  const handleActiveHazardChange = useCallback((index: number) => setActiveHazard(index), [])
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
      <CrisisQuerySearch />
      <LazyLoadBoundary
        fallback={
          // A failed gallery chunk fetch (e.g. offline, nothing cached for it
          // yet) must not take the hazard links down with it — reaching
          // bushfire/flood/power-outage guidance is the actual offline-scope
          // requirement, the gallery itself is just the usual presentation.
          <ul className="crisis-hazard-fallback-list">
            {crisisContent.map((item) => (
              <li key={item.kind}>
                <Link to={appRoutes.crisisDetail(item.kind)}>{item.title}</Link>
              </li>
            ))}
          </ul>
        }
      >
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
      </LazyLoadBoundary>
    </section>
  )
}
