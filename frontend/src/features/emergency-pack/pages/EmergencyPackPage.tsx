import { FirstAidKit, Printer } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { fetchChecklistItems, fetchHelplines } from '../../../data/api/apiCrisisRepository'
import { LoadingState } from '../../../shared/components/LoadingState'
import { useOnlineStatus } from '../../../shared/hooks/useOnlineStatus'
import { getSearchLocation } from '../../../storage/searchLocationStorage'
import type { CrisisKind } from '../../crisis/crisisContent'
import { getMapPlaceRepository } from '../../map/data/mapPlaceRepository'
import { nearestPlaces, toChecklistGroups, toPackHelplines } from '../crisisPackSnapshot'
import { HANDWRITTEN_CONTACT_ROWS, crisisPackOptions } from '../emergencyPackContent'
import {
  emptyEmergencyPackSnapshot,
  readEmergencyPack,
  saveEmergencyPack,
  type EmergencyPackPreferences,
  type EmergencyPackSnapshot,
} from '../emergencyPackStorage'
import './EmergencyPackPage.css'

function preparedDate(value: string | undefined): string {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return 'Date not available'
  return new Intl.DateTimeFormat('en-AU', { dateStyle: 'long' }).format(date)
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
    let isCurrent = true
    const baseUrl = import.meta.env.VITE_API_BASE_URL ?? ''
    const saved = readEmergencyPack().snapshot
    const next: EmergencyPackSnapshot = {
      ...emptyEmergencyPackSnapshot(),
      ...saved,
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
      if ((preferences.includeWifi || preferences.includeCharities) && areaPostcode) {
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

      if (preferences.includeHelplines) {
        try {
          next.helplines = toPackHelplines(await fetchHelplines({ baseUrl }))
        } catch {
          problems.push('Helpline numbers could not be updated. A saved copy is shown when one is available.')
        }
      }

      await Promise.all(preferences.crises.map(async (kind) => {
        try {
          const records = await fetchChecklistItems(kind, { baseUrl })
          if (records.length > 0) next.checklists = { ...next.checklists, [kind]: toChecklistGroups(records) }
        } catch {
          problems.push('A crisis checklist could not be updated. A saved copy is shown when one is available.')
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
  }, [areaLabel, areaPostcode, isOnline, preferences])

  function updatePreferences(next: EmergencyPackPreferences) {
    const current = readEmergencyPack()
    saveEmergencyPack({ preferences: next, snapshot: current.snapshot })
    setPreferences(next)
  }

  function toggleCrisis(kind: CrisisKind, enabled: boolean) {
    const crises = crisisPackOptions
      .map((option) => option.kind)
      .filter((item) => item === kind ? enabled : preferences.crises.includes(item))
    updatePreferences({ ...preferences, crises })
  }

  const selectedCrises = crisisPackOptions.filter((option) => preferences.crises.includes(option.kind))
  const includeNearby = preferences.includeWifi || preferences.includeCharities
  const showSheet = includeNearby || preferences.includeHelplines || selectedCrises.length > 0

  return (
    <section className="emergency-pack-page" aria-labelledby="emergency-pack-title">
      <header className="page-heading emergency-pack-intro">
        <div>
          <h1 id="emergency-pack-title">Emergency pack</h1>
          <p>Choose what to keep for when the connection drops. Download or print the pack, then write your own emergency contacts by hand.</p>
        </div>
      </header>

      <form className="emergency-pack-choices" onSubmit={(event) => event.preventDefault()}>
        <label className="check-card">
          <input
            type="checkbox"
            checked={preferences.includeWifi}
            onChange={(event) => updatePreferences({ ...preferences, includeWifi: event.target.checked })}
          />
          <span>
            <strong>Wi-Fi spots</strong>
            <small>The 5 nearest public Wi-Fi spots to your saved area.</small>
          </span>
        </label>
        <label className="check-card">
          <input
            type="checkbox"
            checked={preferences.includeCharities}
            onChange={(event) => updatePreferences({ ...preferences, includeCharities: event.target.checked })}
          />
          <span>
            <strong>Charities</strong>
            <small>The 5 nearest support places to your saved area.</small>
          </span>
        </label>
        <label className="check-card">
          <input
            type="checkbox"
            checked={preferences.includeHelplines}
            onChange={(event) => updatePreferences({ ...preferences, includeHelplines: event.target.checked })}
          />
          <span>
            <strong>Helpline numbers</strong>
            <small>All published helpline numbers, so they are still readable on paper.</small>
          </span>
        </label>
        <fieldset className="emergency-pack-crises">
          <legend>Crisis checklists</legend>
          <p>Choose one hazard, all three, or none. Each choice adds that household checklist.</p>
          {crisisPackOptions.map((option) => (
            <label className="check-card" key={option.kind}>
              <input
                type="checkbox"
                checked={preferences.crises.includes(option.kind)}
                onChange={(event) => toggleCrisis(option.kind, event.target.checked)}
              />
              <span>
                <strong>{option.label}</strong>
                <small>{option.label} checklist</small>
              </span>
            </label>
          ))}
        </fieldset>
      </form>

      <div className="emergency-pack-toolbar">
        <button className="button button--primary" type="button" onClick={() => window.print()}>
          <FirstAidKit aria-hidden="true" size={18} /> Download PDF
        </button>
        <button className="button button--quiet" type="button" onClick={() => window.print()}>
          <Printer aria-hidden="true" size={18} /> Print
        </button>
        <p>In the print window, choose Save as PDF to download a copy, or choose a printer.</p>
      </div>
      {notice ? <p className="inline-status" role="status">{notice}</p> : null}

      <article className="emergency-pack-sheet" aria-label="Emergency pack preview">
        <header>
          <p className="emergency-pack-sheet__brand">ShieldAhead</p>
          <h2>Emergency pack</h2>
          <p>
            {snapshot.areaLabel ? `Prepared for ${snapshot.areaLabel}` : 'No saved area yet'}
            {' · '}
            {preparedDate(snapshot.savedAt)}
          </p>
        </header>

        {isLoading ? <LoadingState /> : null}

        {includeNearby ? (
          <section>
            <h3>Support near you</h3>
            {areaPostcode ? null : (
              <p>Choose an area before nearby places can be added. <Link to={`${appRoutes.location}?next=${encodeURIComponent(appRoutes.emergencyPack)}`}>Choose an area</Link></p>
            )}
            {areaPostcode && snapshot.wifi.length === 0 && snapshot.support.length === 0 && !isLoading ? <p>No nearby places are saved for this area yet.</p> : null}
            {preferences.includeWifi && snapshot.wifi.length > 0 ? (
              <>
                <h4>Public Wi-Fi</h4>
                <ul className="pack-places">
                  {snapshot.wifi.map((place) => (
                    <li key={place.id}><strong>{place.name}</strong><span>{place.detail}</span></li>
                  ))}
                </ul>
              </>
            ) : null}
            {preferences.includeCharities && snapshot.support.length > 0 ? (
              <>
                <h4>Support places</h4>
                <ul className="pack-places">
                  {snapshot.support.map((place) => (
                    <li key={place.id}>
                      <strong>{place.name}</strong>
                      <span>{place.detail}{place.phone ? ` · ${place.phone}` : ''}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>
        ) : null}

        {preferences.includeHelplines ? (
          <section>
            <h3>Helpline numbers</h3>
            {snapshot.helplines.length === 0 && !isLoading ? <p>Helpline numbers are not saved on this device yet.</p> : null}
            <ul className="pack-helplines">
              {snapshot.helplines.map((helpline) => (
                <li key={helpline.id}>
                  <strong>{helpline.name}</strong>
                  <span>{helpline.phone}</span>
                  {helpline.detail ? <small>{helpline.detail}</small> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {selectedCrises.map((option) => {
          const groups = snapshot.checklists[option.kind] ?? []
          return (
            <section key={option.kind}>
              <h3>{option.label}</h3>
              <h4>{option.label} checklist</h4>
              {groups.length === 0 && !isLoading ? <p>This checklist is not saved on this device yet.</p> : null}
              {groups.map((group) => (
                <div key={group.id}>
                  <h5>{group.title}</h5>
                  <ul className="pack-tasks">
                    {group.items.map((item) => (
                      <li key={item.id}>
                        <strong>{item.task}</strong>
                        {item.description ? <span>{item.description}</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          )
        })}

        <section className="pack-contacts-section">
          <h3>Emergency contacts</h3>
          <p>Leave these lines blank. Write names and phone numbers by hand after you print the pack.</p>
          <table className="pack-contacts">
            <thead>
              <tr>
                <th>Name</th>
                <th>Relationship</th>
                <th>Phone number</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: HANDWRITTEN_CONTACT_ROWS }, (_, index) => (
                <tr key={index}>
                  <td />
                  <td />
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {showSheet ? <p className="pack-footnote">Check current official warnings before you travel. Places and phone numbers can change.</p> : null}
      </article>
    </section>
  )
}
