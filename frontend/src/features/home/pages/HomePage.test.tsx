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
  it('introduces ShieldAhead, then explains the complete preparation journey', () => {
    renderHome()

    expect(screen.getByRole('heading', { name: /Shield Ahead.*Before it happens/i })).toBeVisible()
    expect(screen.getByText(/save local information to your device now/i)).toBeVisible()
    expect(screen.getByRole('link', { name: 'Find what’s near you' })).toHaveAttribute('href', '/location')
    expect(screen.getByRole('link', { name: 'See how it works' })).toHaveAttribute('href', '#how-it-works')
    expect(screen.getByText('Prevention, not crisis response')).toBeVisible()
    expect(screen.getByText('Works even offline')).toBeVisible()
    expect(screen.getByText('Private by default, on your device')).toBeVisible()
    expect(screen.getByText('All of VIC')).toBeVisible()
    expect(screen.queryByText(/Loddon Campaspe/i)).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Prepare once. Know where to turn.' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Prepare your household.' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'See what is nearby.' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Check before travelling.' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Keep it on your phone.' })).toBeVisible()
    expect(screen.getByRole('img', { name: 'An older woman sitting on a sofa and using a phone' })).toBeVisible()
    expect(screen.getByRole('img', { name: 'Two people looking at information together on a mobile phone' })).toBeVisible()
    expect(screen.getByRole('img', { name: 'The entrance of the State Library Victoria in Melbourne' })).toBeVisible()
    expect(screen.getByRole('img', { name: 'A person using a mobile phone' })).toBeVisible()
  })

  it('provides clear preparation destinations and explains on-device privacy', () => {
    renderHome()

    expect(screen.getByRole('heading', { name: 'What is ShieldAhead?' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Why ShieldAhead?' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Our key features' })).toBeVisible()
    expect(screen.getByRole('link', { name: /Crisis preparation/i })).toHaveAttribute('href', '/crisis')
    expect(screen.getByRole('link', { name: /^Offline information/i })).toHaveAttribute('href', '/settings/offline-information')
    expect(screen.getByRole('link', { name: /Nearby Wi-Fi/i })).toHaveAttribute('href', '/map?category=wifi')
    expect(screen.getByRole('link', { name: /Nearby support/i })).toHaveAttribute('href', '/map?category=support')
    expect(screen.getByRole('heading', { name: 'Your information stays yours.' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Built for households that may need extra support.' })).toBeVisible()
    expect(screen.getByText('Postcode, not continuous tracking')).toBeVisible()
    expect(screen.queryByText('Coming later')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Crisis Pack' })).not.toBeInTheDocument()
  })
})
