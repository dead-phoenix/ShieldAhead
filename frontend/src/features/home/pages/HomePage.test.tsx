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
  it('introduces ShieldAhead, then offers support and Wi-Fi destinations', () => {
    renderHome()

    expect(screen.getByRole('heading', { name: /Local help.*Within reach/i })).toBeVisible()
    expect(screen.getByText('Within reach.')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Find what’s near you' })).toHaveAttribute('href', '/location')
    expect(screen.getByRole('link', { name: 'See how it works' })).toHaveAttribute('href', '#how-it-works')
    expect(screen.getByText('Prevention, not crisis response')).toBeVisible()
    expect(screen.getByText('Works even offline')).toBeVisible()
    expect(screen.getByText('Private by default, on your device')).toBeVisible()
    expect(screen.getByText('All of VIC')).toBeVisible()
    expect(screen.queryByText(/Loddon Campaspe/i)).not.toBeInTheDocument()
    expect(screen.getByText(/Here’s what you can do/i)).toBeVisible()
    expect(screen.getByText(/listed for your area/i)).toBeVisible()
    expect(screen.getByText(/Wi-Fi places in your area/i)).toBeVisible()

    const supportLink = screen.getByRole('link', { name: /Open support list/i })
    const wifiLink = screen.getByRole('link', { name: /Open Wi-Fi list/i })
    expect(supportLink).toHaveAttribute('href', '/support')
    expect(wifiLink).toHaveAttribute('href', '/wifi')
    expect(supportLink.compareDocumentPosition(wifiLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('describes the Crisis Pack as a later iteration, not a current destination', () => {
    renderHome()

    expect(screen.getByText('Coming later')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Crisis Pack' })).toBeVisible()
    expect(screen.getByText(/not available in this version/i)).toBeVisible()
    expect(screen.queryByRole('link', { name: /Crisis Pack/i })).not.toBeInTheDocument()
  })
})
