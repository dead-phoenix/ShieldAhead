import { ArrowLeft, Check, CloudCheck, Info, ShieldWarning } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { StatusBanner } from '../../../shared/components/StatusBanner'
import { getCrisisContent } from '../crisisContent'
import { readCrisisChecklist, saveCrisisChecklist } from '../crisisChecklistStorage'

export function CrisisDetailPage() {
  const { kind } = useParams()
  const content = getCrisisContent(kind)
  const [checked, setChecked] = useState(() => readCrisisChecklist(kind ?? ''))
  const itemIds = useMemo(() => content?.checklist.flatMap((group) => group.items.map((item) => `${group.id}.${item.id}`)) ?? [], [content])
  const completed = itemIds.filter((id) => checked[id]).length

  if (!content) return <Navigate replace to={appRoutes.crisis} />

  function toggleItem(id: string) {
    const next = { ...checked, [id]: !checked[id] }
    setChecked(next)
    saveCrisisChecklist(content!.kind, next)
  }

  return <section className="content-page crisis-page crisis-detail-page" aria-labelledby="crisis-detail-title">
    <Link className="page-back-link" to={appRoutes.crisis}><ArrowLeft aria-hidden="true" size={18} /> Back to Crisis</Link>
    <header className="crisis-detail-hero">
      <div><span className="crisis-local-label"><CloudCheck aria-hidden="true" size={18} /> Checklist saved on this device</span><h1 id="crisis-detail-title">{content.title}</h1><p>{content.summary}</p></div>
      <div className="crisis-source-panel"><ShieldWarning aria-hidden="true" size={30} /><strong>Content review status</strong><span>{content.sourceOwner}</span></div>
    </header>
    <StatusBanner title="Prototype preparation content — not an emergency warning" tone="warning"><p>This page does not provide live conditions or emergency navigation. Follow official warnings and instructions during an emergency.</p></StatusBanner>
    <section className="crisis-guidance" aria-labelledby="guidance-title">
      <div className="crisis-section-heading"><div><h2 id="guidance-title">Preparation guidance</h2><p>The final, human-reviewed instructions will be organised into these three stages.</p></div></div>
      <div className="crisis-guidance__stages">
        {['Before an emergency', 'When conditions change', 'After the event'].map((stage) => <section key={stage}><h3>{stage}</h3><p>Reviewed guidance will be added here after the team confirms the wording and source.</p></section>)}
      </div>
    </section>
    <section className="crisis-checklist" aria-labelledby="checklist-title">
      <div className="crisis-checklist__summary"><div><h2 id="checklist-title">Household preparation checklist</h2><p>This checklist belongs only to this hazard page.</p></div><strong>{completed} of {itemIds.length} complete</strong></div>
      <progress aria-label="Checklist progress" max={itemIds.length} value={completed}>{completed} of {itemIds.length}</progress>
      <div className="crisis-checklist__groups">
        {content.checklist.map((group) => {
          const groupIds = group.items.map((item) => `${group.id}.${item.id}`)
          const groupCompleted = groupIds.filter((id) => checked[id]).length
          return <fieldset key={group.id}><legend>{group.title} <span>{groupCompleted} of {group.items.length}</span></legend>
            {group.items.map((item) => {
              const id = `${group.id}.${item.id}`
              return <label className="crisis-checklist__item" key={id}><input checked={Boolean(checked[id])} onChange={() => toggleItem(id)} type="checkbox" /><span className="crisis-checklist__check" aria-hidden="true"><Check size={16} weight="bold" /></span><span><strong>{item.label}</strong><small>{item.description}</small></span></label>
            })}
          </fieldset>
        })}
      </div>
      <p className="crisis-checklist__privacy"><Info aria-hidden="true" size={18} /> Your checklist progress stays in this browser on this device.</p>
    </section>
  </section>
}
