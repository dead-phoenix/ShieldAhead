import { Check, DownloadSimple } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { fetchChecklistItems, fetchHelplines } from '../../../data/api/apiCrisisRepository'
import { LoadingState } from '../../../shared/components/LoadingState'
import { useOnlineStatus } from '../../../shared/hooks/useOnlineStatus'
import { getSearchLocation } from '../../../storage/searchLocationStorage'
import type { CrisisKind } from '../../crisis/crisisContent'
import { getMapPlaceRepository } from '../../map/data/mapPlaceRepository'
import { CRISIS_PACK_DOCUMENT_TITLE, buildCrisisPack } from '../buildCrisisPack'
import { CrisisPackPreview } from '../components/CrisisPackPreview'
import { nearestPlaces, toChecklistGroups, toPackHelplines } from '../crisisPackSnapshot'
import { crisisPackOptions } from '../emergencyPackContent'
import {
  emptyEmergencyPackSnapshot,
  readEmergencyPack,
  saveEmergencyPack,
  type EmergencyPackPreferences,
  type EmergencyPackSnapshot,
} from '../emergencyPackStorage'
import './EmergencyPackPage.css'

type ContentToggleKey = 'includeHelplines' | 'includeWifi' | 'includeCharities'

const contentToggles: { key: ContentToggleKey; label: string }[] = [
  { key: 'includeHelplines', label: 'Helplines' },
  { key: 'includeWifi', label: 'Wi-Fi spots' },
  { key: 'includeCharities', label: 'Charities' },
]

function PackToggle({ label, pressed, onToggle }: { label: string; pressed: boolean; onToggle: () => void }) {
  return (
    <button
      className={pressed ? 'filter-chip is-active' : 'filter-chip'}
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
    >
      {pressed ? <Check aria-hidden="true" size={16} weight="bold" /> : null}
      {label}
    </button>
  )
}

export function EmergencyPackPage() {
  const isOnline = useOnlineStatus()
  const area = getSearchLocation()
  const areaPostcode = area?.postcode ?? ''
  const areaLabel = area?.label ?? ''
  const [preferences, setPreferences] = useState<EmergencyPackPreferences>(() => readEmergencyPack().preferences)
  const [snapshot, setSnapshot] = useState<EmergencyPackSnapshot>(() => readEmergencyPack().snapshot)
  const [isLoading, setIsLoading] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const previousTitle = document.title
    document.title = CRISIS_PACK_DOCUMENT_TITLE
    return () => {
      document.title = previousTitle
    }
  }, [])

  useEffect(() => {
    let isCurrent = true
    const baseUrl = import.meta.env.VITE_API_BASE_URL ?? ''
    const saved = readEmergencyPack().snapshot
    const areaChanged = Boolean(areaPostcode && saved.postcode && saved.postcode !== areaPostcode)
    const next: EmergencyPackSnapshot = {
      ...emptyEmergencyPackSnapshot(),
      ...saved,
      ...(areaChanged ? { wifi: [], support: [], placesSavedAt: {} } : {}),
      areaLabel: areaLabel || saved.areaLabel,
      postcode: areaPostcode || saved.postcode,
    }
    const problems: string[] = []

    async function load() {
      if (!isOnline) {
        if (isCurrent) {
          setIsLoading(false)
          setNotice(next.savedAt
            ? 'You are offline. This pack shows the last copy saved on this device.'
            : 'You are offline. Connect once to save helplines, checklists, and nearby places on this device.')
        }
        return
      }

      setIsLoading(true)
      setNotice('')
      if (areaPostcode) {
        try {
          const result = await getMapPlaceRepository({ postcode: areaPostcode }).findNearby({ postcode: areaPostcode })
          const loadedSources = new Set(result.datasets.map((dataset) => dataset.source))
          const loadedAt = new Date().toISOString()
          if (loadedSources.has('wifi')) {
            next.wifi = nearestPlaces(result.places, 'wifi')
            next.placesSavedAt = { ...next.placesSavedAt, wifi: loadedAt }
          }
          if (loadedSources.has('support')) {
            next.support = nearestPlaces(result.places, 'support')
            next.placesSavedAt = { ...next.placesSavedAt, support: loadedAt }
          }
          next.areaLabel = areaLabel || areaPostcode
          next.postcode = areaPostcode
        } catch {
          problems.push('Nearby places could not be updated. A saved copy is shown when one is available.')
        }
      }

      try {
        next.helplines = toPackHelplines(await fetchHelplines({ baseUrl }))
      } catch {
        problems.push('Helpline numbers could not be updated. A saved copy is shown when one is available.')
      }

      await Promise.all(crisisPackOptions.map(async ({ kind }) => {
        try {
          const records = await fetchChecklistItems(kind, { baseUrl })
          if (records.length > 0) next.checklists = { ...next.checklists, [kind]: toChecklistGroups(records) }
        } catch {
          problems.push('A crisis checklist could not be updated. The checklist saved with the app is shown instead.')
        }
      }))

      next.savedAt = new Date().toISOString()
      const current = readEmergencyPack()
      saveEmergencyPack({ preferences: current.preferences, snapshot: next })
      if (!isCurrent) return
      setSnapshot(next)
      setNotice(problems.length > 0 ? problems[0] : '')
      setIsLoading(false)
    }

    void load()
    return () => {
      isCurrent = false
    }
  }, [areaLabel, areaPostcode, isOnline])

  const pack = useMemo(
    () => buildCrisisPack({ preferences, snapshot, downloadedAt: new Date() }),
    [preferences, snapshot],
  )

  function updatePreferences(next: EmergencyPackPreferences) {
    const current = readEmergencyPack()
    saveEmergencyPack({ preferences: next, snapshot: current.snapshot })
    setPreferences(next)
  }

  function toggleContent(key: ContentToggleKey) {
    updatePreferences({ ...preferences, [key]: !preferences[key] })
  }

  function toggleCrisis(kind: CrisisKind) {
    const enabled = !preferences.crises.includes(kind)
    const crises = crisisPackOptions
      .map((option) => option.kind)
      .filter((item) => item === kind ? enabled : preferences.crises.includes(item))
    updatePreferences({ ...preferences, crises })
  }

  // TODO(group 4): replace window.print() with client-side PDF generation, then remove the print CSS in EmergencyPackPage.css.
  function downloadPack() {
    window.print()
  }

  const includesPlaces = preferences.includeWifi || preferences.includeCharities

  return (
    <section className="emergency-pack-page" aria-labelledby="emergency-pack-title">
      <header className="page-heading emergency-pack-intro">
        <div>
          <h1 id="emergency-pack-title">Crisis pack</h1>
          <p>Choose what goes in your pack, check the preview, then download it to print or keep on this device. Write your own emergency contacts by hand.</p>
        </div>
      </header>

      <div className="emergency-pack-choices">
        <div className="emergency-pack-toggles" role="group" aria-labelledby="emergency-pack-help-label">
          <h2 id="emergency-pack-help-label">Get help</h2>
          <div className="emergency-pack-toggles__row">
            {contentToggles.map((toggle) => (
              <PackToggle
                key={toggle.key}
                label={toggle.label}
                pressed={preferences[toggle.key]}
                onToggle={() => toggleContent(toggle.key)}
              />
            ))}
          </div>
        </div>
        <div className="emergency-pack-toggles" role="group" aria-labelledby="emergency-pack-checklists-label">
          <h2 id="emergency-pack-checklists-label">Checklists</h2>
          <div className="emergency-pack-toggles__row">
            {crisisPackOptions.map((option) => (
              <PackToggle
                key={option.kind}
                label={option.label}
                pressed={preferences.crises.includes(option.kind)}
                onToggle={() => toggleCrisis(option.kind)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="emergency-pack-toolbar">
        <button className="button button--primary" type="button" onClick={downloadPack}>
          <DownloadSimple aria-hidden="true" size={18} /> Download crisis pack as PDF
        </button>
      </div>

      {includesPlaces && !areaPostcode ? (
        <p className="inline-status">
          Choose an area before nearby places can be added.{' '}
          <Link to={`${appRoutes.location}?next=${encodeURIComponent(appRoutes.emergencyPack)}`}>Choose an area</Link>
        </p>
      ) : null}
      {notice ? <p className="inline-status" role="status">{notice}</p> : null}
      {isLoading ? <LoadingState label="Updating saved information" /> : null}

      <CrisisPackPreview pack={pack} />
    </section>
  )
}
