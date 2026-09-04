import { CheckCircle, CloudArrowDown, Database, Trash, WifiHigh } from '@phosphor-icons/react'
import { useState } from 'react'
import { appRoutes } from '../../../app/config/product'
import type { OfflinePreferences } from '../../../data/contracts'
import {
  clearAllOfflineDatasets,
  removeOfflineDataset,
  type OfflineDatasetKind,
} from '../../../data/offline/offlineDatasetStore'
import { useOfflineDatasetSummaries } from '../../../data/offline/useOfflineDatasetSummaries'
import { getSupportServiceRepository } from '../../../data/supportServiceRepository'
import { getWifiRepository } from '../../../data/wifiRepository'
import { PageBackLink } from '../../../shared/components/PageBackLink'
import { formatSavedDate } from '../../../shared/utils/formatDate'
import { getSearchPostcode } from '../../../storage/searchLocationStorage'
import {
  getOfflinePreferences,
  saveOfflinePreferences,
} from '../../../storage/onboardingDraftStorage'

export function OfflineInformationPage() {
  const postcode = getSearchPostcode()
  const [preferences, setPreferences] = useState(getOfflinePreferences)
  const [message, setMessage] = useState('')
  const [busyKind, setBusyKind] = useState<OfflineDatasetKind | 'all' | null>(null)
  const { summaries, isLoading } = useOfflineDatasetSummaries(postcode)

  const selectedCount = Number(preferences.wifiSaved) + Number(preferences.supportSaved)
  const readyCount = Number(preferences.wifiSaved && Boolean(summaries.wifi))
    + Number(preferences.supportSaved && Boolean(summaries.support))
  const isReady = selectedCount > 0 && selectedCount === readyCount

  function persistPreferences(next: OfflinePreferences) {
    saveOfflinePreferences(next)
    setPreferences(next)
  }

  async function download(kind: OfflineDatasetKind) {
    const repository = kind === 'wifi'
      ? getWifiRepository(postcode)
      : getSupportServiceRepository(postcode)
    const result = await repository.list()
    if (result.metadata.refreshError) throw new Error(result.metadata.refreshError)
  }

  async function toggleDataset(kind: OfflineDatasetKind, enabled: boolean) {
    const next = {
      ...preferences,
      [kind === 'wifi' ? 'wifiSaved' : 'supportSaved']: enabled,
    }
    persistPreferences(next)
    setBusyKind(kind)
    setMessage('')

    try {
      if (!enabled) {
        await removeOfflineDataset(kind, postcode)
        setMessage(`${kind === 'wifi' ? 'Wi-Fi' : 'Support'} information removed from this device.`)
      } else if (!navigator.onLine) {
        setMessage('Selected for offline use. Connect to the internet to download this information.')
      } else {
        await download(kind)
        persistPreferences({ ...next, lastUpdatedAt: new Date().toISOString() })
        setMessage(`${kind === 'wifi' ? 'Wi-Fi' : 'Support'} information downloaded for offline use.`)
      }
    } catch (reason) {
      setMessage(reason instanceof Error
        ? `${reason.message} Your selection has been kept so you can try again.`
        : 'The information could not be downloaded. Your selection has been kept so you can try again.')
    } finally {
      setBusyKind(null)
    }
  }

  async function refreshInformation() {
    if (!navigator.onLine) {
      setMessage('You are offline. Saved information is still available, but it cannot be updated yet.')
      return
    }

    const selectedKinds: OfflineDatasetKind[] = [
      ...(preferences.wifiSaved ? ['wifi' as const] : []),
      ...(preferences.supportSaved ? ['support' as const] : []),
    ]
    setBusyKind('all')
    setMessage('Updating saved information…')
    const results = await Promise.allSettled(selectedKinds.map(download))
    const failedCount = results.filter((result) => result.status === 'rejected').length
    if (failedCount < selectedKinds.length) {
      persistPreferences({ ...preferences, lastUpdatedAt: new Date().toISOString() })
    }
    setMessage(failedCount === 0
      ? 'Saved information is up to date and ready offline.'
      : `${selectedKinds.length - failedCount} section${selectedKinds.length - failedCount === 1 ? '' : 's'} updated. ${failedCount} could not be updated; the previous saved copy was kept.`)
    setBusyKind(null)
  }

  async function removeAll() {
    setBusyKind('all')
    try {
      await clearAllOfflineDatasets()
      persistPreferences({ wifiSaved: false, supportSaved: false })
      setMessage('Downloaded public information removed from this device.')
    } catch {
      setMessage('Downloaded information could not be removed. Close other ShieldAhead windows and try again.')
    } finally {
      setBusyKind(null)
    }
  }

  function datasetDescription(kind: OfflineDatasetKind) {
    const summary = summaries[kind]
    if (isLoading) return 'Checking saved information…'
    if (summary) {
      const noun = kind === 'wifi' ? 'place' : 'service'
      return `${summary.recordCount} ${noun}${summary.recordCount === 1 ? '' : 's'} · Saved ${formatSavedDate(summary.savedAt)}`
    }
    const selected = kind === 'wifi' ? preferences.wifiSaved : preferences.supportSaved
    return selected ? 'Selected · download required' : 'Not saved on this device'
  }

  return (
    <section className="content-page" aria-labelledby="offline-title">
      <PageBackLink to={appRoutes.settings}>Back to profile</PageBackLink>
      <div className="page-heading"><div><h1 id="offline-title">Offline information</h1><p>Choose which public information remains readable when your connection is unavailable.</p></div></div>
      <div className={`offline-ready${isReady ? '' : ' offline-ready--pending'}`}>
        {isReady ? <CheckCircle aria-hidden="true" size={26} weight="fill" /> : <CloudArrowDown aria-hidden="true" size={26} />}
        <span><strong>{isReady ? 'Ready offline' : selectedCount ? 'Download needed' : 'Nothing selected'}</strong><small>{isReady ? `${readyCount} selected section${readyCount === 1 ? '' : 's'} saved on this device.` : selectedCount ? 'Connect and update to finish saving your selection.' : 'Select Wi-Fi or Support information to prepare this device.'}</small></span>
      </div>
      <div className="offline-dataset-list">
        <label className="offline-dataset"><span className="record-row__icon"><WifiHigh aria-hidden="true" size={24} /></span><span><strong>Wi-Fi places near postcode {postcode}</strong><small>{datasetDescription('wifi')}</small></span><input aria-label="Save Wi-Fi information offline" type="checkbox" checked={preferences.wifiSaved} disabled={busyKind !== null} onChange={(event) => void toggleDataset('wifi', event.target.checked)} /></label>
        <label className="offline-dataset"><span className="record-row__icon"><Database aria-hidden="true" size={24} /></span><span><strong>Support services near postcode {postcode}</strong><small>{datasetDescription('support')}</small></span><input aria-label="Save Support information offline" type="checkbox" checked={preferences.supportSaved} disabled={busyKind !== null} onChange={(event) => void toggleDataset('support', event.target.checked)} /></label>
      </div>
      {message ? <p className="inline-status" role="status" aria-live="polite">{message}</p> : null}
      <div className="detail-actions">
        <button className="button button--primary" type="button" disabled={selectedCount === 0 || busyKind !== null} onClick={() => void refreshInformation()}>{busyKind === 'all' ? 'Updating…' : 'Update saved information'}</button>
        <button className="button button--danger-outline" type="button" disabled={busyKind !== null || readyCount === 0} onClick={() => void removeAll()}><Trash aria-hidden="true" size={19} /> Remove downloaded information</button>
      </div>
      <p className="data-footnote">Public records are stored in this app using IndexedDB. Your private profile and consent choices are managed separately in Profile.</p>
    </section>
  )
}
