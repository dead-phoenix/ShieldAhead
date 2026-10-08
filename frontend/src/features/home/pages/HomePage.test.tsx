import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { HomePage } from './HomePage'

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname + location.search}</div>
}

function renderHome() {
  return render(
    <MemoryRouter>
      <HomePage />
      <LocationProbe />
    </MemoryRouter>,
  )
}

describe('home landing page', () => {
  it('introduces preparation, a static map, and the main destinations', () => {
    renderHome()

    expect(screen.getByRole('heading', { name: /Shield Ahead.*Before it happens/i })).toBeVisible()
    expect(screen.getByText('Practical crisis preparedness for people across Victoria.')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Prepare for a crisis' })).toHaveAttribute('href', '/crisis')
    expect(screen.getByRole('img', { name: 'The entrance of the State Library Victoria in Melbourne' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Find help near you' })).toBeVisible()
    expect(screen.getByText('Essential services at a glance.')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Explore the map' })).toHaveAttribute('href', '/map')
    expect(screen.getByRole('heading', { name: "Prepare for what's ahead" })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Bushfire' })).toHaveAttribute('href', '/crisis/bushfire')
    expect(screen.getByRole('link', { name: 'Flood' })).toHaveAttribute('href', '/crisis/flood')
    expect(screen.getByRole('link', { name: 'Power outage' })).toHaveAttribute('href', '/crisis/power-outage')
    expect(screen.getByRole('link', { name: 'View checklists' })).toHaveAttribute('href', '/crisis')
    expect(screen.getByRole('heading', { name: 'Works offline' })).toBeVisible()
    expect(screen.getByText(/saved information stays available when connectivity/i)).toBeVisible()
  })

  it('takes someone to the wifi map from the home search box', () => {
    renderHome()

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'take me to wifi' } })
    fireEvent.submit(screen.getByRole('combobox').closest('form')!)

    expect(screen.getByTestId('location')).toHaveTextContent('/map?category=wifi')
  })

  it('sends a hazard question from the home search to its guidance page', () => {
    renderHome()

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'How should I prepare for bushfire' } })
    fireEvent.submit(screen.getByRole('combobox').closest('form')!)

    expect(screen.getByTestId('location')).toHaveTextContent('/crisis/bushfire/guidance')
  })

  it('links to the saved nearby services', () => {
    renderHome()
    expect(screen.getByRole('link', { name: 'Saved nearby services (works offline)' })).toHaveAttribute('href', '/nearby')
  })

  it.each(['map', 'nearby', 'near me'])('opens saved nearby services for "%s" when offline', (query) => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false })
    try {
      renderHome()
      fireEvent.change(screen.getByRole('combobox'), { target: { value: query } })
      fireEvent.submit(screen.getByRole('combobox').closest('form')!)
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/nearby$/)
    } finally {
      Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
    }
  })
})
