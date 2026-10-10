import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApiSupportServiceRepository } from '../../data/api/apiSupportServiceRepository'
import type { DatasetResult, SupportService } from '../../data/contracts'
import { saveOfflineDataset } from '../../data/offline/offlineDatasetStore'
import { getSupportServiceRepository } from '../../data/supportServiceRepository'
import { saveMyArea } from '../../storage/myAreaStorage'
import { saveHouseholdProfile } from '../../storage/onboardingDraftStorage'
import { readSavedPlaces, SAVED_PLACES_LIMIT, savePlace, type SavedPlaceInput } from '../../storage/savedPlacesStorage'
import { SetupCompletePage } from '../onboarding/pages/SetupCompletePage'
import { SettingsPage } from '../settings/pages/SettingsPage'
import { SupportServiceDetailPage } from '../support-services/pages/SupportServiceDetailPage'
import { SavePlaceButton } from './components/SavePlaceButton'
import { SavedPlaceDetailPage } from './pages/SavedPlaceDetailPage'
import { SavedPlacesPage } from './pages/SavedPlacesPage'

vi.mock('../../data/preloadNearbyData', () => ({ preloadNearbyData: vi.fn() }))
vi.mock('../../data/api/apiSupportServiceRepository', () => ({ createApiSupportServiceRepository: vi.fn() }))
vi.mock('../../data/supportServiceRepository', () => ({ getSupportServiceRepository: vi.fn() }))
vi.mock('../../data/offline/staticSupportFallback', () => ({ buildStaticSupportDataset: vi.fn().mockResolvedValue(null) }))

const library: SavedPlaceInput = {
  key: 'wifi:library',
  kind: 'wifi',
  record: { id: 'library', placeType: 'wifi', name: 'Harcourt Library', suburb: 'Harcourt', postcode: '3453', latitude: -36.99, longitude: 144.26, dataUpdatedAt: '2026-09-01T00:00:00.000Z' },
}

const foodBank: SavedPlaceInput = {
  key: 'support:acnc-1',
  kind: 'support',
  record: { id: 'acnc-1', placeType: 'support', name: 'Harcourt Food Bank', suburb: 'Harcourt', postcode: '3453', serviceTypes: ['Food relief'], dataUpdatedAt: '2026-09-01T00:00:00.000Z' },
}

function service(id: string, name: string, distanceKm: number): SupportService {
  return { id, name, serviceTypes: ['Food relief'], suburb: 'Harcourt', postcode: '3453', distanceKm, availabilityStatus: 'not-confirmed', dataUpdatedAt: '2026-10-01T00:00:00.000Z' }
}

function dataset(records: SupportService[]): DatasetResult<SupportService> {
  return { records, metadata: { version: '1', generatedAt: '2026-10-01T00:00:00.000Z', sourceName: 'Test', coverageAreas: [], limitations: [] } }
}

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value })
}

function renderAt(path: string, routes: ReactNode) {
  return render(<MemoryRouter initialEntries={[path]}><Routes>{routes}</Routes></MemoryRouter>)
}

async function saveSupportCache(records: SupportService[]) {
  await saveOfflineDataset('support', '3453', dataset(records), { areaLabel: 'Harcourt 3453', dataSource: 'api' })
}

beforeEach(() => {
  Object.defineProperty(window, 'indexedDB', { configurable: true, value: new IDBFactory() })
  setOnline(true)
  vi.mocked(createApiSupportServiceRepository).mockReturnValue({ list: () => Promise.reject(new Error('Server unavailable.')) })
  vi.mocked(getSupportServiceRepository).mockReturnValue({ list: () => Promise.reject(new Error('No saved information is available for this postcode.')) })
})

afterEach(() => {
  setOnline(true)
})

describe('heart button', () => {
  function renderButton(place: SavedPlaceInput = library) {
    return render(<MemoryRouter><SavePlaceButton place={place} /></MemoryRouter>)
  }

  it('saves on this device only and announces it', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    renderButton()

    const heart = screen.getByRole('button', { name: 'Save Harcourt Library for offline use' })
    expect(heart).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(heart)

    expect(screen.getByRole('button', { name: 'Remove Harcourt Library from saved places' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('Saved for offline use · View saved places')
    expect(readSavedPlaces().map(({ key }) => key)).toEqual(['wifi:library'])
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('removes a saved place', () => {
    savePlace(library)
    renderButton()

    fireEvent.click(screen.getByRole('button', { name: 'Remove Harcourt Library from saved places' }))

    expect(screen.getByRole('status')).toHaveTextContent('Removed from saved places')
    expect(readSavedPlaces()).toEqual([])
  })

  it(`explains the ${SAVED_PLACES_LIMIT}-place limit`, () => {
    for (let index = 0; index < SAVED_PLACES_LIMIT; index += 1) {
      savePlace({ ...library, key: `wifi:${index}`, record: { ...library.record, id: String(index) } })
    }
    renderButton()

    fireEvent.click(screen.getByRole('button', { name: 'Save Harcourt Library for offline use' }))

    expect(screen.getByRole('status')).toHaveTextContent(`You've saved ${SAVED_PLACES_LIMIT} places. Remove one on Saved places to add another.`)
    expect(screen.getByRole('link', { name: 'View saved places' })).toHaveAttribute('href', '/saved')
    expect(readSavedPlaces()).toHaveLength(SAVED_PLACES_LIMIT)
  })
})

describe('saved place detail page', () => {
  it('opens a hearted place offline with the saved-on notice and no directions', () => {
    setOnline(false)
    savePlace(library)
    renderAt('/saved/place/wifi%3Alibrary', <Route path="/saved/place/:key" element={<SavedPlaceDetailPage />} />)

    expect(screen.getByRole('heading', { name: 'Harcourt Library' })).toBeVisible()
    expect(screen.getByText(/^Saved on .*\. Details may have changed\. Check before you go\.$/)).toBeVisible()
    expect(screen.getByRole('button', { name: /Open in maps/ })).toBeDisabled()
    expect(screen.queryByRole('link', { name: /Open in maps/ })).not.toBeInTheDocument()
  })

  it('explains when the place is no longer saved', () => {
    renderAt('/saved/place/wifi%3Agone', <Route path="/saved/place/:key" element={<SavedPlaceDetailPage />} />)

    expect(screen.getByText('This place is not in your saved places')).toBeVisible()
  })
})

describe('support detail page offline', () => {
  beforeEach(() => {
    setOnline(false)
    saveMyArea({ postcode: '3453', localityName: 'Harcourt' })
  })

  function renderSupport(id: string) {
    return renderAt(`/support/${id}`, <Route path="/support/:id" element={<SupportServiceDetailPage />} />)
  }

  it('shows a hearted support place', async () => {
    savePlace(foodBank)
    renderSupport('acnc-1')

    expect(await screen.findByRole('heading', { name: 'Harcourt Food Bank' })).toBeVisible()
    expect(screen.getByText(/Distance not saved with this place/)).toBeVisible()
    expect(screen.getByText(/Details may have changed\. Check before you go\./)).toBeVisible()
  })

  it('shows a service from the list saved for My area, with distance from My area', async () => {
    await saveSupportCache([service('acnc-7', 'Kyneton Pantry', 4.2)])
    renderSupport('acnc-7')

    expect(await screen.findByRole('heading', { name: 'Kyneton Pantry' })).toBeVisible()
    expect(screen.getByText(/4\.2 km from My area/)).toBeVisible()
  })

  it('explains when a place is not saved on this device', async () => {
    renderSupport('acnc-404')

    expect(await screen.findByText("This place isn't saved on this device")).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('saved places page', () => {
  function renderSaved() {
    return renderAt('/saved', <Route path="/saved" element={<SavedPlacesPage />} />)
  }

  beforeEach(() => {
    saveMyArea({ postcode: '3453', localityName: 'Harcourt' })
  })

  it('lists hearted places and the support services saved for My area', async () => {
    savePlace(library)
    await saveSupportCache([service('acnc-7', 'Kyneton Pantry', 4.2), service('acnc-8', 'Bendigo Help', 9)])
    renderSaved()

    expect(screen.getByRole('link', { name: /Harcourt Library/ })).toHaveAttribute('href', '/saved/place/wifi%3Alibrary')
    expect(await screen.findByText(/^Saved 2 nearest support services for Harcourt 3453 on /)).toBeVisible()
    expect(screen.getByRole('link', { name: /Kyneton Pantry/ })).toHaveAttribute('href', '/support/acnc-7')
    expect(screen.getByText('4.2 km from My area')).toBeVisible()
    expect(screen.getByRole('button', { name: /Refresh/ })).toBeEnabled()
  })

  it('works offline from what is on this device', async () => {
    setOnline(false)
    savePlace(library)
    await saveSupportCache([service('acnc-7', 'Kyneton Pantry', 4.2)])
    renderSaved()

    expect(screen.getByText("You're offline. Showing what is saved on this device.")).toBeVisible()
    expect(screen.getByRole('link', { name: /Harcourt Library/ })).toBeVisible()
    expect(await screen.findByRole('link', { name: /Kyneton Pantry/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /Refresh/ })).toBeDisabled()
    expect(screen.getByText('Needs an internet connection')).toBeVisible()
  })

  it('removes a hearted place from the list', () => {
    savePlace(library)
    renderSaved()

    fireEvent.click(screen.getByRole('button', { name: 'Remove Harcourt Library from saved places' }))

    expect(screen.getByText('Removed Harcourt Library from saved places')).toBeVisible()
    expect(screen.queryByRole('link', { name: /Harcourt Library/ })).not.toBeInTheDocument()
  })

  it('says plainly when nothing is saved yet', async () => {
    renderSaved()

    expect(screen.getByText(/Nothing saved yet/)).toBeVisible()
    expect(await screen.findByText("Not saved yet. We'll try again when you're online.")).toBeVisible()
  })
})

describe('truthful save status', () => {
  beforeEach(() => {
    saveMyArea({ postcode: '3453', localityName: 'Harcourt' })
    saveHouseholdProfile({})
  })

  it('setup complete reports a failed save and offers Save now', async () => {
    render(<MemoryRouter><SetupCompletePage /></MemoryRouter>)

    expect(await screen.findByText("Not saved yet. We'll try again when you're online.")).toBeVisible()
    await waitFor(() => expect(screen.getByRole('button', { name: /Save now/ })).toBeEnabled())
  })

  it('setup complete reports the saved list once it is on this device', async () => {
    vi.mocked(createApiSupportServiceRepository).mockReturnValue({
      list: () => Promise.resolve(dataset([service('acnc-7', 'Kyneton Pantry', 4.2)])),
    })
    render(<MemoryRouter><SetupCompletePage /></MemoryRouter>)

    expect(await screen.findByText(/^Saved 1 nearest support service for Harcourt 3453 on /)).toBeVisible()
    expect(screen.queryByRole('button', { name: /Save now/ })).not.toBeInTheDocument()
  })

  it('settings shows what is saved', async () => {
    savePlace(library)
    await saveSupportCache([service('acnc-7', 'Kyneton Pantry', 4.2)])
    render(<MemoryRouter><SettingsPage /></MemoryRouter>)

    expect(screen.getByText('1 place saved on this device')).toBeVisible()
    expect(await screen.findByText(/^Saved 1 nearest support service for Harcourt 3453 on /)).toBeVisible()
  })
})
