import { ArrowClockwise, CheckCircle, CloudArrowDown, Warning } from '@phosphor-icons/react'
import { useState } from 'react'
import { appRoutes } from '../../../app/config/product'
import { prepareOffline, type OfflineReadinessResult } from '../../../data/offline/prepareOffline'
import { PageBackLink } from '../../../shared/components/PageBackLink'
import { formatSavedDate } from '../../../shared/utils/formatDate'
import { getMyArea } from '../../../storage/myAreaStorage'

function readinessHeading(result: OfflineReadinessResult | null): string {
  if (!result) return 'Not checked yet'
  if (result.status === 'ready') return 'Ready offline'
  if (result.status === 'partial') return 'Partly ready'
  return 'Not ready'
}

function readinessDetail(result: OfflineReadinessResult | null): string {
  if (!result) return 'Save nearby services to prepare this device for no signal.'
  if (result.status === 'ready') return `Saved ${formatSavedDate(result.checkedAt)}.`
  if (result.status === 'partial') return `${result.missingUrls.length} file${result.missingUrls.length === 1 ? '' : 's'} still missing. Try again, ideally on a stronger connection.`
  return 'Nothing is saved for offline use yet. Try again while connected.'
}

export function OfflineInformationPage() {
  const myArea = getMyArea()
  const [result, setResult] = useState<OfflineReadinessResult | null>(null)
  const [isChecking, setIsChecking] = useState(false)

  async function save() {
    setIsChecking(true)
    try {
      setResult(await prepareOffline())
    } finally {
      setIsChecking(false)
    }
  }

  const ready = result?.status === 'ready'

  return (
    <section className="content-page" aria-labelledby="offline-title">
      <PageBackLink to={appRoutes.settings}>Back to profile</PageBackLink>
      <div className="page-heading">
        <div>
          <h1 id="offline-title">Offline information</h1>
          <p>Save the crisis guide and nearby services so they still open with no signal.</p>
        </div>
      </div>

      {!myArea ? (
        <p className="inline-status" role="status">
          Set <strong>My area</strong> first, in <PageBackLink to={appRoutes.myArea}>Settings</PageBackLink>, so nearby services can be saved for it.
        </p>
      ) : null}

      <div className={`offline-ready${ready ? '' : ' offline-ready--pending'}`}>
        {ready ? <CheckCircle aria-hidden="true" size={26} weight="fill" /> : result?.status === 'partial' ? <Warning aria-hidden="true" size={26} /> : <CloudArrowDown aria-hidden="true" size={26} />}
        <span>
          <strong>{readinessHeading(result)}</strong>
          <small>{readinessDetail(result)}</small>
        </span>
      </div>

      {result?.persisted === false ? (
        <p className="inline-status" role="status">This browser did not grant persistent storage — saved information may be cleared if the device runs low on space.</p>
      ) : null}

      <div className="detail-actions">
        <button className="button button--primary" type="button" disabled={isChecking} onClick={() => void save()}>
          {isChecking ? 'Saving…' : result ? <><ArrowClockwise aria-hidden="true" size={18} /> Retry</> : <><CloudArrowDown aria-hidden="true" size={18} /> Save nearby services for offline use</>}
        </button>
      </div>

      <p className="data-footnote">
        This saves the crisis guide, checklists, helplines and a list of nearby Wi-Fi, charities, hospitals, police, fire and ambulance stations
        for <strong>My area</strong>. To remove everything saved on this device, use Delete everything in Profile.
      </p>
    </section>
  )
}
