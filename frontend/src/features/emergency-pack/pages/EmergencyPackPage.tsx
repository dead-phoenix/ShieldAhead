import { FirstAidKit, Printer } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { fetchChecklistItems, fetchHelplines, type ChecklistItemRecord, type Helpline } from '../../../data/api/apiCrisisRepository'
import { LoadingState } from '../../../shared/components/LoadingState'
import { useOnlineStatus } from '../../../shared/hooks/useOnlineStatus'
import { getSearchLocation } from '../../../storage/searchLocationStorage'
import type { CrisisKind } from '../../crisis/crisisContent'
import { getMapPlaceRepository } from '../../map/data/mapPlaceRepository'
import type { MapPlace } from '../../map/model/mapTypes'
import {
  HANDWRITTEN_CONTACT_ROWS,
  NEARBY_PLACE_LIMIT,
  crisisGuidelines,
  crisisPackOptions,
} from '../emergencyPackContent'
import {
  emptyEmergencyPackSnapshot,
  readEmergencyPack,
  saveEmergencyPack,
  type EmergencyPackPreferences,
  type EmergencyPackSnapshot,
  type PackChecklistGroup,
  type PackHelpline,
  type PackPlace,
} from '../emergencyPackStorage'
import './EmergencyPackPage.css'

function placeDetail(place: MapPlace): string {
  const locality = [place.suburb, place.postcode].filter(Boolean).join(' ')
  const address = place.address ? [place.address, locality].filter(Boolean).join(', ') : locality
  const distance = place.distanceKm === undefined ? '' : `${place.distanceKm.toFixed(1)} km`
  return [address || 'Address not provided', distance].filter(Boolean).join(' · ')
}

function toPackPlace(place: MapPlace): PackPlace {
  return {
    id: place.id,
    name: place.name,
    detail: placeDetail(place),
    phone: place.phone,
  }
}

function nearestPlaces(places: MapPlace[], kind: MapPlace['kind']): PackPlace[] {
  return [...places]
    .filter((place) => place.kind === kind)
    .sort((left, right) => (left.distanceKm ?? Number.POSITIVE_INFINITY) - (right.distanceKm ?? Number.POSITIVE_INFINITY))
    .slice(0, NEARBY_PLACE_LIMIT)
    .map(toPackPlace)
}

function toPackHelplines(records: Helpline[]): PackHelpline[] {
  const seen = new Set<string>()
  return records.filter((record) => {
    const key = `${record.name}|${record.phone}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).map((record) => ({
    id: record.id,
    name: record.name,
    phone: record.phone,
    detail: [record.description, record.availability, record.coverageArea].filter(Boolean).join(' · ') || undefined,
  }))
}

function toChecklistGroups(records: ChecklistItemRecord[]): PackChecklistGroup[] {
  const groups = new Map<string, PackChecklistGroup>()
  for (const record of [...records].sort((left, right) => left.displayOrder - right.displayOrder)) {
    if (!groups.has(record.categoryId)) {
      groups.set(record.categoryId, { id: record.categoryId, title: record.category, items: [] })
    }
    groups.get(record.categoryId)?.items.push({
      id: record.itemId,
      task: record.task,
      description: record.description,
    })
  }
  return [...groups.values()]
}

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
      if (preferences.includeNearby && areaPostcode) {
        try {
          const result = await getMapPlaceRepository({ postcode: areaPostcode }).findNearby({ postcode: areaPostcode })
          next.wifi = nearestPlaces(result.places, 'wifi')
          next.support = nearestPlaces(result.places, 'support')
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
  const showSheet = preferences.includeNearby || preferences.includeHelplines || selectedCrises.length > 0

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
            checked={preferences.includeNearby}
            onChange={(event) => updatePreferences({ ...preferences, includeNearby: event.target.checked })}
          />
          <span>
            <strong>Support near you</strong>
            <small>About 5 public Wi-Fi spots and 5 support places near your saved area.</small>
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
          <legend>Crisis checklists and guidelines</legend>
          <p>Choose one hazard or all three. Each choice adds that household checklist, plus general guidance on what to do and what not to do.</p>
          {crisisPackOptions.map((option) => (
            <label className="check-card" key={option.kind}>
              <input
                type="checkbox"
                checked={preferences.crises.includes(option.kind)}
                onChange={(event) => toggleCrisis(option.kind, event.target.checked)}
              />
              <span>
                <strong>{option.label}</strong>
                <small>{option.checklistTitle}</small>
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

        {preferences.includeNearby ? (
          <section>
            <h3>Support near you</h3>
            {areaPostcode ? null : (
              <p>Choose an area before nearby places can be added. <Link to={`${appRoutes.location}?next=${encodeURIComponent(appRoutes.emergencyPack)}`}>Choose an area</Link></p>
            )}
            {areaPostcode && snapshot.wifi.length === 0 && snapshot.support.length === 0 && !isLoading ? <p>No nearby places are saved for this area yet.</p> : null}
            {snapshot.wifi.length > 0 ? (
              <>
                <h4>Public Wi-Fi</h4>
                <ul className="pack-places">
                  {snapshot.wifi.map((place) => (
                    <li key={place.id}><strong>{place.name}</strong><span>{place.detail}</span></li>
                  ))}
                </ul>
              </>
            ) : null}
            {snapshot.support.length > 0 ? (
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
          const guidelines = crisisGuidelines[option.kind]
          const groups = snapshot.checklists[option.kind] ?? []
          return (
            <section key={option.kind}>
              <h3>{option.label}</h3>
              <h4>{option.checklistTitle}</h4>
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
              <div className="pack-guidelines">
                <div>
                  <h4>What to do</h4>
                  <ul>{guidelines.dos.map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
                <div>
                  <h4>What not to do</h4>
                  <ul>{guidelines.donts.map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
              </div>
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
