import { ArrowLeft, ArrowSquareOut, CalendarBlank, ShieldWarning } from '@phosphor-icons/react'
import { Navigate, Link, useParams } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { getCrisisContent } from '../crisisContent'

export function CrisisGuidancePage() {
  const { kind } = useParams()
  const content = getCrisisContent(kind)

  if (!content) return <Navigate replace to={appRoutes.crisis} />

  return <section className="content-page crisis-page crisis-guidance-page" aria-labelledby="crisis-guidance-title">
    <Link className="page-back-link" to={appRoutes.crisisDetail(content.kind)}><ArrowLeft aria-hidden="true" size={18} /> Back to {content.title}</Link>
    <header className="crisis-detail-hero">
      <div>
        <h1 id="crisis-guidance-title">Preparation guidance</h1>
        <p>What to do before, during, and after — based on the official sources linked with each action.</p>
      </div>
      <div className="crisis-source-panel">
        <ShieldWarning aria-hidden="true" size={30} />
        <strong>Content source</strong>
        <span>{content.sourceOwner}</span>
        <a href={content.sourceUrl} rel="noreferrer" target="_blank">Read official guidance <ArrowSquareOut aria-hidden="true" size={16} /></a>
        {content.officialDetailsUrl && <a href={content.officialDetailsUrl} rel="noreferrer" target="_blank">For official details, check VICSES <ArrowSquareOut aria-hidden="true" size={16} /></a>}
        <span className="crisis-source-panel__date"><CalendarBlank aria-hidden="true" size={16} /> Last checked {content.lastVerified}</span>
      </div>
    </header>
    <section className="crisis-guidance" aria-label="Preparation guidance by stage">
      {content.guidance.map((stage) => (
        <div className="crisis-guidance-stage" key={stage.id}>
          <h2>{stage.title}</h2>
          {stage.introduction && <p className="crisis-guidance-stage__intro">{stage.introduction}</p>}
          <div className="crisis-guidance-stage__items">
            {stage.items.map((item) => (
              <article className="crisis-guidance-item" key={item.id}>
                <h3>{item.title}</h3>
                <p>{item.summary}</p>
                {item.steps && <ul>{item.steps.map((step) => <li key={step}>{step}</li>)}</ul>}
                <div className="crisis-guidance-item__sources">
                  <a href={item.sourceUrl} rel="noreferrer" target="_blank">Source: {item.sourceName} <ArrowSquareOut aria-hidden="true" size={15} /></a>
                  {item.officialDetailsUrl && <a href={item.officialDetailsUrl} rel="noreferrer" target="_blank">For official details, check VICSES <ArrowSquareOut aria-hidden="true" size={15} /></a>}
                </div>
              </article>
            ))}
          </div>
        </div>
      ))}
    </section>
  </section>
}
