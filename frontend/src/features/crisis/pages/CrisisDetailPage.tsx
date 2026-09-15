import { ArrowLeft, ArrowSquareOut, CalendarBlank, CaretDown, Check, CheckCircle, CloudCheck, Info, Phone, ShieldWarning, X } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { getChecklistGroups, getHelplines } from '../../../data/crisis/crisisStaticContent'
import { getCrisisContent } from '../crisisContent'
import { readCrisisChecklist, saveCrisisChecklist } from '../crisisChecklistStorage'

export function CrisisDetailPage() {
  const { kind } = useParams()
  const content = getCrisisContent(kind)
  const checklistGroups = useMemo(() => getChecklistGroups(kind ?? ''), [kind])
  const helplines = useMemo(() => getHelplines(kind ?? ''), [kind])
  const [checked, setChecked] = useState(() => readCrisisChecklist(kind ?? ''))
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null)
  const guidanceDialogRef = useRef<HTMLDialogElement>(null)
  const itemIds = useMemo(() => checklistGroups.flatMap((group) => group.items.map((item) => `${group.id}.${item.id}`)), [checklistGroups])
  const completed = itemIds.filter((id) => checked[id]).length
  const nextItem = checklistGroups.flatMap((group) => group.items.map((item) => ({ ...item, fullId: `${group.id}.${item.id}` }))).find((item) => !checked[item.fullId])
  const selectedStage = content?.guidance.find((stage) => stage.id === selectedStageId)
  const selectedStageIndex = content?.guidance.findIndex((stage) => stage.id === selectedStageId) ?? -1

  useEffect(() => {
    const dialog = guidanceDialogRef.current
    if (!dialog) return
    if (selectedStage && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal()
      else dialog.setAttribute('open', '')
    }
    if (!selectedStage && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close()
      else dialog.removeAttribute('open')
    }
  }, [selectedStage])

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
      <div className="crisis-source-panel">
        <ShieldWarning aria-hidden="true" size={30} />
        <strong>Content source</strong>
        <span>{content.sourceOwner}</span>
        <a href={content.sourceUrl} rel="noreferrer" target="_blank">Read official guidance <ArrowSquareOut aria-hidden="true" size={16} /></a>
        <span className="crisis-source-panel__date"><CalendarBlank aria-hidden="true" size={16} /> Last checked {content.lastVerified}</span>
      </div>
    </header>
    <section className="crisis-guidance" aria-labelledby="guidance-title">
      <div className="crisis-section-heading"><div><h2 id="guidance-title">Preparation guidance</h2><p>Short ShieldAhead summaries based on the official sources linked with each action. Team sign-off is still required before release.</p></div></div>
      <div className="crisis-guidance__stages">
        {content.guidance.map((stage) => <button aria-label={`Open ${stage.title.toLowerCase()} guide`} aria-haspopup="dialog" className="crisis-guidance__stage" key={stage.id} onClick={() => setSelectedStageId(stage.id)} type="button">
          <img alt="" loading="lazy" src={`/assets/crisis/guidance/${content.kind}-${stage.id}.webp`} />
        </button>)}
      </div>
      <dialog aria-labelledby="guidance-dialog-title" className="crisis-guidance-dialog" onClose={() => setSelectedStageId(null)} ref={guidanceDialogRef}>
        {selectedStage && <div className="crisis-guidance-dialog__content">
          <button aria-label="Close guide" className="crisis-guidance-dialog__close" onClick={() => setSelectedStageId(null)} type="button"><X aria-hidden="true" size={24} /></button>
          <div className="crisis-guidance-dialog__media">
            <img alt="" src={`/assets/crisis/guidance/${content.kind}-${selectedStage.id}.webp`} />
          </div>
          <div className="crisis-guidance-dialog__body" key={selectedStage.id}>
            <header>
              <span>{selectedStageIndex + 1}/{content.guidance.length}</span>
            </header>
            <div className="crisis-guidance-dialog__intro">
              <h3 id="guidance-dialog-title">{selectedStage.title}</h3>
              {selectedStage.introduction && <p>{selectedStage.introduction}</p>}
            </div>
            <div className="crisis-guidance-dialog__actions">
              {selectedStage.items.map((item) => <article key={item.id}>
                <h4>{item.title}</h4>
                <p>{item.summary}</p>
                {item.steps && <ul>{item.steps.map((step) => <li key={step}>{step}</li>)}</ul>}
                <a href={item.sourceUrl} rel="noreferrer" target="_blank">Source: {item.sourceName} <ArrowSquareOut aria-hidden="true" size={16} /></a>
              </article>)}
            </div>
            <p className="crisis-guidance-dialog__note"><Info aria-hidden="true" size={18} /> Preparation information only. Check current official warnings when conditions change.</p>
          </div>
        </div>}
      </dialog>
    </section>
    {helplines.length > 0 && <section className="crisis-helplines" aria-labelledby="helplines-title">
      <div className="crisis-section-heading"><div><h2 id="helplines-title">Helpline numbers</h2><p>Save these numbers before you need them — some services may be unreachable during an outage.</p></div></div>
      <ul className="crisis-helplines__list">
        {helplines.map((helpline) => <li className="crisis-helplines__item" key={helpline.id}>
          <div>
            <strong>{helpline.name}</strong>
            {helpline.description && <p>{helpline.description}</p>}
            <span className="crisis-helplines__meta">{helpline.serviceType}{helpline.availability ? ` · ${helpline.availability}` : ''}{helpline.coverageArea ? ` · ${helpline.coverageArea}` : ''}</span>
          </div>
          <a className="crisis-helplines__phone" href={`tel:${helpline.phone.replace(/\s+/g, '')}`}><Phone aria-hidden="true" size={18} weight="fill" /> {helpline.phone}</a>
        </li>)}
      </ul>
      <p className="crisis-helplines__source"><Info aria-hidden="true" size={18} /> Source: <a href="https://www.cfa.vic.gov.au/" rel="noreferrer" target="_blank">CFA (Country Fire Authority) <ArrowSquareOut aria-hidden="true" size={15} /></a></p>
    </section>}
    <section className="crisis-checklist" aria-labelledby="checklist-title">
      <div className="crisis-checklist__summary"><div><h2 id="checklist-title">Household preparation checklist</h2><p>This checklist belongs only to this hazard page.</p></div><strong>{completed} of {itemIds.length} complete</strong></div>
      <progress aria-label="Checklist progress" max={itemIds.length} value={completed}>{completed} of {itemIds.length}</progress>
      <div className={`crisis-checklist__next${nextItem ? '' : ' is-complete'}`}>
        <div>
          <span>{nextItem ? 'Your next step' : 'Checklist complete'}</span>
          <strong>{nextItem?.label ?? 'You have completed every preparation task on this page.'}</strong>
          {nextItem && <p>{nextItem.description}</p>}
        </div>
        {nextItem ? <a href={`#checklist-${nextItem.fullId}`}>Go to this task</a> : <CheckCircle aria-hidden="true" size={30} weight="fill" />}
      </div>
      <div className="crisis-checklist__groups">
        {checklistGroups.map((group) => {
          const groupIds = group.items.map((item) => `${group.id}.${item.id}`)
          const groupCompleted = groupIds.filter((id) => checked[id]).length
          return <fieldset key={group.id}><legend>{group.title} <span>{groupCompleted} of {group.items.length}</span></legend>
            {group.items.map((item) => {
              const id = `${group.id}.${item.id}`
              const isChecked = Boolean(checked[id])
              return <div className={`crisis-checklist__item${isChecked ? ' is-complete' : ''}`} id={`checklist-${id}`} key={id}>
                <label>
                  <input checked={isChecked} onChange={() => toggleItem(id)} type="checkbox" />
                  <span className="crisis-checklist__check" aria-hidden="true"><Check size={16} weight="bold" /></span>
                  <span><strong>{item.label}</strong><small>{item.description}</small>{isChecked && <span className="crisis-checklist__completed">Completed</span>}</span>
                </label>
                <details>
                  <summary>How to complete this <CaretDown aria-hidden="true" size={17} weight="bold" /></summary>
                  <div className="crisis-checklist__instructions">
                    <ol>{item.steps.map((step) => <li key={step}>{step}</li>)}</ol>
                    <p>Tick this task only when these steps are ready for your household.</p>
                    <a href={content.sourceUrl} rel="noreferrer" target="_blank">Read official guidance <ArrowSquareOut aria-hidden="true" size={15} /></a>
                  </div>
                </details>
              </div>
            })}
          </fieldset>
        })}
      </div>
      <p className="crisis-checklist__privacy"><Info aria-hidden="true" size={18} /> Your checklist progress stays in this browser on this device.</p>
    </section>
  </section>
}
