import { ArrowLeft, ArrowSquareOut, CalendarBlank, ShieldWarning } from '@phosphor-icons/react'
import { useState } from 'react'
import { Navigate, Link, useLocation, useParams } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { getCrisisContent, type CrisisGuidanceItem, type CrisisGuidanceStage } from '../crisisContent'

/** Several items in one stage often cite the same official page — de-duplicated
 * by URL so it's listed once at the bottom of the stage, not after every item. */
function stageSources(items: CrisisGuidanceItem[]): Pick<CrisisGuidanceItem, 'sourceName' | 'sourceUrl' | 'officialDetailsUrl'>[] {
  const seen = new Map<string, Pick<CrisisGuidanceItem, 'sourceName' | 'sourceUrl' | 'officialDetailsUrl'>>()
  for (const item of items) {
    if (!seen.has(item.sourceUrl)) {
      seen.set(item.sourceUrl, { sourceName: item.sourceName, sourceUrl: item.sourceUrl, officialDetailsUrl: item.officialDetailsUrl })
    }
  }
  return [...seen.values()]
}

export function CrisisGuidancePage() {
  const { kind } = useParams()
  const location = useLocation()
  const content = getCrisisContent(kind)
  const requestedStage = (location.state as { stage?: CrisisGuidanceStage['id'] } | null)?.stage
  const [activeStageId, setActiveStageId] = useState<CrisisGuidanceStage['id']>(
    requestedStage ?? content?.guidance[0]?.id ?? 'before',
  )

  if (!content) return <Navigate replace to={appRoutes.crisis} />

  const activeStage = content.guidance.find((stage) => stage.id === activeStageId) ?? content.guidance[0]
  const sources = stageSources(activeStage.items)

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
    <div className="crisis-guidance-tabs" role="tablist" aria-label="Preparation guidance stage">
      {content.guidance.map((stage) => (
        <button
          aria-controls={`crisis-guidance-panel-${stage.id}`}
          aria-selected={stage.id === activeStage.id}
          className={stage.id === activeStage.id ? 'is-active' : ''}
          id={`crisis-guidance-tab-${stage.id}`}
          key={stage.id}
          onClick={() => setActiveStageId(stage.id)}
          role="tab"
          type="button"
        >
          {stage.title}
        </button>
      ))}
    </div>
    <section
      aria-labelledby={`crisis-guidance-tab-${activeStage.id}`}
      className="crisis-guidance"
      id={`crisis-guidance-panel-${activeStage.id}`}
      role="tabpanel"
    >
      <div className="crisis-guidance-stage">
        {activeStage.introduction && <p className="crisis-guidance-stage__intro">{activeStage.introduction}</p>}
        <div className="crisis-guidance-stage__items">
          {activeStage.items.map((item) => (
            <article className="crisis-guidance-item" key={item.id}>
              <h3>{item.title}</h3>
              <p>{item.summary}</p>
              {item.steps && <ul>{item.steps.map((step) => <li key={step}>{step}</li>)}</ul>}
            </article>
          ))}
        </div>
        <div className="crisis-guidance-stage__sources">
          <h3>Sources</h3>
          <ul>
            {sources.map((source) => (
              <li key={source.sourceUrl}>
                <a href={source.sourceUrl} rel="noreferrer" target="_blank">{source.sourceName} <ArrowSquareOut aria-hidden="true" size={15} /></a>
                {source.officialDetailsUrl && <a href={source.officialDetailsUrl} rel="noreferrer" target="_blank">For official details, check VICSES <ArrowSquareOut aria-hidden="true" size={15} /></a>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  </section>
}
