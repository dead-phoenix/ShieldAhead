import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { storageKeys } from '../../../app/config/product'
import { lookupLocalities } from '../../../data/offline/offlineDataLoader'
import { clearAllLocalData } from '../../../storage/clearAllLocalData'
import { DeleteProfilePage } from './DeleteProfilePage'
import { MyAreaPage } from './MyAreaPage'
import { SettingsPage } from './SettingsPage'

vi.mock('../../../data/preloadNearbyData', () => ({
  preloadNearbyData: vi.fn(),
}))

vi.mock('../../../data/offline/offlineDataLoader', () => ({
  lookupLocalities: vi.fn(),
}))

vi.mock('../../../storage/clearAllLocalData', () => ({
  clearAllLocalData: vi.fn().mockResolvedValue(undefined),
}))

function renderWithRouter(element: ReactElement) {
  return render(<MemoryRouter>{element}</MemoryRouter>)
}

describe('Settings privacy pages', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.mocked(clearAllLocalData).mockClear()
    vi.mocked(lookupLocalities).mockReset()
  })

  it('shows My area and the delete-everything link even when no household notes are saved', () => {
    window.localStorage.setItem(storageKeys.myArea, JSON.stringify({ postcode: '3453', label: '3453', savedAt: '2026-10-01T00:00:00.000Z' }))
    renderWithRouter(<SettingsPage />)

    expect(screen.getByRole('link', { name: /3453/ })).toHaveAttribute('href', '/settings/my-area')
    expect(screen.getByRole('link', { name: 'Delete everything saved on this device' })).toHaveAttribute('href', '/settings/delete-profile')
    expect(screen.getByRole('link', { name: 'Set up my household' })).toBeVisible()
    expect(screen.queryByText(/Name|Household size/)).not.toBeInTheDocument()
  })

  it('migrates an old profile and shows only the kept fields', () => {
    window.localStorage.setItem(storageKeys.householdProfile, JSON.stringify({ name: 'Mel', age: 40, householdSize: 3, hasPets: true, postcode: '3453' }))
    renderWithRouter(<SettingsPage />)

    expect(screen.queryByText('Mel')).not.toBeInTheDocument()
    expect(screen.getByText('Pets').nextSibling).toHaveTextContent('Yes')
    expect(screen.getByRole('link', { name: /3453/ })).toBeVisible()
  })

  it('changes My area from settings, keeping the postcode only when suburbs cannot be looked up', async () => {
    vi.mocked(lookupLocalities).mockResolvedValue(null)
    window.localStorage.setItem(storageKeys.myArea, JSON.stringify({ postcode: '3453', label: '3453', savedAt: '2026-10-01T00:00:00.000Z' }))
    renderWithRouter(<MyAreaPage />)

    const input = screen.getByLabelText('Postcode')
    expect(input).toHaveValue('3453')
    fireEvent.change(input, { target: { value: '35' } })
    fireEvent.click(screen.getByRole('button', { name: 'Change My area' }))
    expect(screen.getByRole('alert')).toHaveTextContent('four-digit')

    fireEvent.change(screen.getByLabelText('Postcode'), { target: { value: '3550' } })
    fireEvent.click(screen.getByRole('button', { name: 'Change My area' }))
    expect(await screen.findByRole('status')).toHaveTextContent('My area is now 3550.')
    expect(JSON.parse(window.localStorage.getItem(storageKeys.myArea)!)).toMatchObject({ postcode: '3550', label: '3550' })
    expect(screen.getByText('Your postcode is used to look up nearby places. Your household details never leave this device.')).toBeVisible()
  })

  it('saves the suburb straight away when the postcode has exactly one locality', async () => {
    vi.mocked(lookupLocalities).mockResolvedValue([{ id: 'loc-elmore', name: 'Elmore', postcodes: ['3558'], lat: -36.49, lng: 144.61 }])
    renderWithRouter(<MyAreaPage />)

    fireEvent.change(screen.getByLabelText('Postcode'), { target: { value: '3558' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save My area' }))

    expect(await screen.findByRole('status')).toHaveTextContent('My area is now Elmore 3558.')
    expect(JSON.parse(window.localStorage.getItem(storageKeys.myArea)!)).toMatchObject({
      postcode: '3558', localityId: 'loc-elmore', localityName: 'Elmore', label: 'Elmore 3558',
    })
    expect(screen.getByText('Current area').nextSibling).toHaveTextContent('Elmore 3558')
  })

  it('asks which suburb when the postcode has several localities', async () => {
    vi.mocked(lookupLocalities).mockResolvedValue([
      { id: 'loc-harcourt', name: 'Harcourt', postcodes: ['3453'], lat: -36.9934, lng: 144.2583 },
      { id: 'loc-harcourt-north', name: 'Harcourt North', postcodes: ['3453'], lat: -36.9511, lng: 144.2763 },
    ])
    renderWithRouter(<MyAreaPage />)

    fireEvent.change(screen.getByLabelText('Postcode'), { target: { value: '3453' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save My area' }))
    expect(await screen.findByRole('group', { name: 'Which suburb in 3453?' })).toBeVisible()
    expect(window.localStorage.getItem(storageKeys.myArea)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Save My area' }))
    expect(await screen.findByText('Choose your suburb, or choose to use the postcode only.')).toBeVisible()

    fireEvent.click(screen.getByRole('radio', { name: 'Harcourt' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save My area' }))
    expect(await screen.findByRole('status')).toHaveTextContent('My area is now Harcourt 3453.')
    expect(lookupLocalities).toHaveBeenCalledTimes(1)
    expect(JSON.parse(window.localStorage.getItem(storageKeys.myArea)!)).toMatchObject({ localityId: 'loc-harcourt', label: 'Harcourt 3453' })
  })

  it('shows the suburb in My area on the settings page', () => {
    window.localStorage.setItem(storageKeys.myArea, JSON.stringify({ postcode: '3453', localityId: 'loc-harcourt', localityName: 'Harcourt', label: 'Harcourt 3453', savedAt: '' }))
    renderWithRouter(<SettingsPage />)
    expect(screen.getByRole('link', { name: /Harcourt 3453/ })).toHaveAttribute('href', '/settings/my-area')
  })

  it('deletes everything saved on this device from the delete page', async () => {
    renderWithRouter(<DeleteProfilePage />)
    expect(screen.getByRole('heading', { name: 'Delete everything saved on this device?' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Delete everything saved on this device' }))

    expect(await screen.findByRole('heading', { name: 'Everything saved on this device was deleted' })).toBeVisible()
    expect(clearAllLocalData).toHaveBeenCalledTimes(1)
  })
})
