import { ArrowLeft, ArrowSquareOut, Check, CheckCircle, CloudCheck, Info, Phone } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { getCrisisContent } from '../crisisContent'
import { readCrisisChecklist, saveCrisisChecklist } from '../crisisChecklistStorage'
import { useCrisisChecklist, useHelplines } from '../useCrisisApiContent'

const checklistTitles = {
  bushfire: 'Bushfire Household Checklist',
  flood: 'Flood Household Checklist',
  'power-outage': 'Power Outage Household Checklist',
} as const

export function CrisisDetailPage() {
  const { kind } = useParams()
  const content = getCrisisContent(kind)
  const checklistGroups = useCrisisChecklist(kind ?? '')
  const helplines = useHelplines(kind ?? '')
  const helplineSource = useMemo(() => {
    const url = helplines[0]?.verifiedAgainst
    if (!url) return undefined
    return { url, label: new URL(url).hostname.replace(/^www\./, '') }
  }, [helplines])
  const [checked, setChecked] = useState(() => readCrisisChecklist(kind ?? ''))
  const itemIds = useMemo(() => checklistGroups.flatMap((group) => group.items.map((item) => `${group.id}.${item.id}`)), [checklistGroups])
  const completed = itemIds.filter((id) => checked[id]).length
  const nextItem = checklistGroups.flatMap((group) => group.items.map((item) => ({ ...item, fullId: `${group.id}.${item.id}` }))).find((item) => !checked[item.fullId])

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
      {helplines.length > 0 && <aside className="crisis-helpline-card" aria-labelledby="helplines-title">
        <h2 id="helplines-title"><Phone aria-hidden="true" size={22} weight="fill" /> Helpline numbers</h2>
        <ul>
          {helplines.map((helpline) => <li key={helpline.id}>
            <div>
              <strong>{helpline.name}</strong>
              {helpline.description && <p>{helpline.description}</p>}
              <span>{helpline.serviceType}{helpline.availability ? ` · ${helpline.availability}` : ''}{helpline.coverageArea ? ` · ${helpline.coverageArea}` : ''}</span>
            </div>
            <a href={`tel:${helpline.phone.replace(/\s+/g, '')}`}>{helpline.phone}</a>
          </li>)}
        </ul>
        {helplineSource && <p className="crisis-helpline-card__source"><Info aria-hidden="true" size={16} /> Source: <a href={helplineSource.url} rel="noreferrer" target="_blank">{helplineSource.label} <ArrowSquareOut aria-hidden="true" size={14} /></a></p>}
      </aside>}
    </header>
    <section className="crisis-checklist" aria-labelledby="checklist-title">
      <div className="crisis-checklist__summary"><div><h2 id="checklist-title">{checklistTitles[content.kind]}</h2><p>This checklist belongs only to this hazard page.</p></div><strong>{completed} of {itemIds.length} complete</strong></div>
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
              </div>
            })}
          </fieldset>
        })}
      </div>
      <p className="crisis-checklist__privacy"><Info aria-hidden="true" size={18} /> Your checklist progress stays in this browser on this device.</p>
    </section>
  </section>
}
