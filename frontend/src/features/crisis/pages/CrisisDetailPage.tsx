import { ArrowLeft, ArrowRight, ArrowSquareOut, Check, CheckCircle, CloudCheck, DownloadSimple, FloppyDisk, Info, Phone } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { crisisContent, getCrisisContent, householdChecklistTitles, type CrisisKind } from '../crisisContent'
import { readCrisisChecklist, saveCrisisChecklist } from '../crisisChecklistStorage'
import { useCrisisChecklist, useHelplines } from '../useCrisisApiContent'

const hazardShortLabels: Record<CrisisKind, string> = {
  bushfire: 'Bushfire',
  flood: 'Flood',
  'power-outage': 'Power outage',
}

function stepKey(groupId: string, itemId: string, stepIndex: number): string {
  return `${groupId}.${itemId}.step-${stepIndex}`
}

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
  const [saveMessage, setSaveMessage] = useState('')
  const allSteps = useMemo(() => checklistGroups.flatMap((group) =>
    group.items.flatMap((item) =>
      item.steps.map((step, stepIndex) => ({
        key: stepKey(group.id, item.id, stepIndex),
        step,
        itemLabel: item.label,
        anchorId: `${group.id}.${item.id}`,
      })),
    ),
  ), [checklistGroups])
  const completed = allSteps.filter((s) => checked[s.key]).length
  const nextStep = allSteps.find((s) => !checked[s.key])

  if (!content) return <Navigate replace to={appRoutes.crisis} />

  const hazardKinds = crisisContent.map((item) => item.kind)
  const hazardIndex = hazardKinds.indexOf(content.kind)
  const prevHazard = hazardIndex > 0 ? hazardKinds[hazardIndex - 1] : null
  const nextHazard = hazardIndex < hazardKinds.length - 1 ? hazardKinds[hazardIndex + 1] : null

  function toggleStep(key: string) {
    const next = { ...checked, [key]: !checked[key] }
    setChecked(next)
    saveCrisisChecklist(content!.kind, next)
    setSaveMessage('')
  }

  function toggleItem(stepKeys: string[]) {
    const nextValue = !stepKeys.every((key) => checked[key])
    const next = { ...checked }
    for (const key of stepKeys) next[key] = nextValue
    setChecked(next)
    saveCrisisChecklist(content!.kind, next)
    setSaveMessage('')
  }

  function saveChecklist() {
    saveCrisisChecklist(content!.kind, checked)
    setSaveMessage('Checklist saved on this device.')
  }

  return <section className="content-page crisis-page crisis-detail-page" aria-labelledby="crisis-detail-title">
    <Link className="page-back-link" to={appRoutes.crisis}><ArrowLeft aria-hidden="true" size={18} /> Back to Crisis</Link>
    <header className="crisis-detail-hero">
      <div><span className="crisis-local-label"><CloudCheck aria-hidden="true" size={18} /> Checklist saved on this device</span><h1 id="crisis-detail-title">{content.title}</h1><p>{content.summary}</p></div>
    </header>
    <div className="crisis-detail-hero__action"><Link className="button button--primary" to={appRoutes.crisisGuidance(content.kind)}>View preparation guidance</Link></div>
    <section className="crisis-checklist" aria-labelledby="checklist-title">
      <div className="crisis-checklist__summary"><div><h2 id="checklist-title">{householdChecklistTitles[content.kind]}</h2><p>This checklist belongs only to this hazard page.</p></div><strong>{completed} of {allSteps.length} complete</strong></div>
      <progress aria-label="Checklist progress" max={allSteps.length} value={completed}>{completed} of {allSteps.length}</progress>
      <div className={`crisis-checklist__next${nextStep ? '' : ' is-complete'}`}>
        <div>
          <span>{nextStep ? 'Your next step' : 'Checklist complete'}</span>
          <strong>{nextStep?.step ?? 'You have completed every preparation task on this page.'}</strong>
          {nextStep && <p>Part of: {nextStep.itemLabel}</p>}
        </div>
        {nextStep ? <a href={`#checklist-${nextStep.anchorId}`}>Go to this task</a> : <CheckCircle aria-hidden="true" size={30} weight="fill" />}
      </div>
      <div className="crisis-checklist__groups">
        {checklistGroups.map((group) => {
          const groupStepKeys = group.items.flatMap((item) => item.steps.map((_, stepIndex) => stepKey(group.id, item.id, stepIndex)))
          const groupCompleted = groupStepKeys.filter((key) => checked[key]).length
          return <fieldset key={group.id}><legend>{group.title} <span>{groupCompleted} of {groupStepKeys.length}</span></legend>
            {group.items.map((item) => {
              const id = `${group.id}.${item.id}`
              const itemStepKeys = item.steps.map((_, stepIndex) => stepKey(group.id, item.id, stepIndex))
              const isChecked = itemStepKeys.length > 0 && itemStepKeys.every((key) => Boolean(checked[key]))
              return <div className={`crisis-checklist__item${isChecked ? ' is-complete' : ''}`} id={`checklist-${id}`} key={id}>
                <label>
                  <input checked={isChecked} onChange={() => toggleItem(itemStepKeys)} type="checkbox" />
                  <span className="crisis-checklist__check" aria-hidden="true"><Check size={16} weight="bold" /></span>
                  <span>
                    <strong>{item.label}</strong>
                    {isChecked && <span className="crisis-checklist__completed">Completed</span>}
                  </span>
                </label>
                {item.steps.length > 0 ? (
                  <ul className="crisis-checklist__substeps">
                    {item.steps.map((step, stepIndex) => {
                      const key = itemStepKeys[stepIndex]
                      const stepChecked = Boolean(checked[key])
                      return <li key={key}>
                        <label>
                          <input checked={stepChecked} onChange={() => toggleStep(key)} type="checkbox" />
                          <span className="crisis-checklist__check crisis-checklist__check--sub" aria-hidden="true"><Check size={12} weight="bold" /></span>
                          {step}
                        </label>
                      </li>
                    })}
                  </ul>
                ) : (
                  <small className="crisis-checklist__item-description">{item.description}</small>
                )}
              </div>
            })}
          </fieldset>
        })}
      </div>
      <div className="crisis-checklist__footer">
        <div className="crisis-checklist__save">
          <button className="button button--primary" type="button" onClick={saveChecklist}>
            <FloppyDisk aria-hidden="true" size={18} /> Save checklist
          </button>
          {saveMessage && <span className="crisis-checklist__save-status" role="status">{saveMessage}</span>}
        </div>
        <div className="crisis-checklist__switch">
          {prevHazard && (
            <Link className="button button--quiet" to={appRoutes.crisisDetail(prevHazard)}>
              <ArrowLeft aria-hidden="true" size={18} /> Back to {hazardShortLabels[prevHazard]} checklist
            </Link>
          )}
          {nextHazard && (
            <Link className="button button--quiet" to={appRoutes.crisisDetail(nextHazard)}>
              Next: {hazardShortLabels[nextHazard]} checklist <ArrowRight aria-hidden="true" size={18} />
            </Link>
          )}
          <Link className="button button--quiet" to={`${appRoutes.emergencyPack}?crisis=${content.kind}`}>
            <DownloadSimple aria-hidden="true" size={18} /> Download this checklist
          </Link>
          {!nextHazard && (
            <Link className="button button--quiet" to={`${appRoutes.emergencyPack}?crisis=all`}>
              <DownloadSimple aria-hidden="true" size={18} /> Download all 3 checklists
            </Link>
          )}
        </div>
      </div>
      <p className="crisis-checklist__privacy"><Info aria-hidden="true" size={18} /> Your checklist progress stays in this browser on this device.</p>
    </section>
    {helplines.length > 0 && <section className="crisis-helplines" aria-labelledby="helplines-title">
      <h2 id="helplines-title"><Phone aria-hidden="true" size={22} weight="fill" /> Helpline numbers</h2>
      <ul className="crisis-helplines__grid">
        {helplines.map((helpline) => <li className="crisis-helplines__card" key={helpline.id}>
          <div className="crisis-helplines__card-heading"><strong>{helpline.name}</strong></div>
          <div className="crisis-helplines__card-body">
            {helpline.description && <p>{helpline.description}</p>}
            <span>{helpline.serviceType}{helpline.availability ? ` · ${helpline.availability}` : ''}{helpline.coverageArea ? ` · ${helpline.coverageArea}` : ''}</span>
            <a href={`tel:${helpline.phone.replace(/\s+/g, '')}`}>{helpline.phone}</a>
          </div>
        </li>)}
      </ul>
      {helplineSource && <p className="crisis-helplines__source"><Info aria-hidden="true" size={16} /> Source: <a href={helplineSource.url} rel="noreferrer" target="_blank">{helplineSource.label} <ArrowSquareOut aria-hidden="true" size={14} /></a></p>}
    </section>}
  </section>
}
