import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { HomePage } from './HomePage'

function renderHome() {
  return render(
    <MemoryRouter>
      <HomePage />
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
})
