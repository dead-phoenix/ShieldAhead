import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { storageKeys } from '../../../app/config/product'
import { clearAllLocalData } from '../../../storage/clearAllLocalData'
import { DeleteProfilePage } from './DeleteProfilePage'
import { MyAreaPage } from './MyAreaPage'
import { SettingsPage } from './SettingsPage'

vi.mock('../../../data/preloadNearbyData', () => ({
  preloadNearbyData: vi.fn(),
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

  it('changes My area from settings', () => {
    window.localStorage.setItem(storageKeys.myArea, JSON.stringify({ postcode: '3453', label: '3453', savedAt: '2026-10-01T00:00:00.000Z' }))
    renderWithRouter(<MyAreaPage />)

    const input = screen.getByLabelText('Postcode')
    expect(input).toHaveValue('3453')
    fireEvent.change(input, { target: { value: '35' } })
    fireEvent.click(screen.getByRole('button', { name: 'Change My area' }))
    expect(screen.getByRole('alert')).toHaveTextContent('four-digit')

    fireEvent.change(screen.getByLabelText('Postcode'), { target: { value: '3550' } })
    fireEvent.click(screen.getByRole('button', { name: 'Change My area' }))
    expect(screen.getByRole('status')).toHaveTextContent('My area is now 3550.')
    expect(JSON.parse(window.localStorage.getItem(storageKeys.myArea)!)).toMatchObject({ postcode: '3550', label: '3550' })
    expect(screen.getByText('Your postcode is used to look up nearby places. Your household details never leave this device.')).toBeVisible()
  })

  it('deletes everything saved on this device from the delete page', async () => {
    renderWithRouter(<DeleteProfilePage />)
    expect(screen.getByRole('heading', { name: 'Delete everything saved on this device?' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Delete everything saved on this device' }))

    expect(await screen.findByRole('heading', { name: 'Everything saved on this device was deleted' })).toBeVisible()
    expect(clearAllLocalData).toHaveBeenCalledTimes(1)
  })
})
