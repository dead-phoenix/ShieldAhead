import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { AppRouter } from '../../../app/AppRouter'

describe('Epic 5 crisis preparation pages', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.history.replaceState({}, '', '/crisis')
  })

  it('puts each checklist inside its disaster page', async () => {
    render(<AppRouter />)

    expect(await screen.findByRole('heading', { name: 'Pre-crisis guidance' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Household preparation checklist' })).not.toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /Prepare for bushfire/i })).toHaveAttribute('href', '/crisis/bushfire')
    expect(screen.getByRole('link', { name: /Prepare for flood/i })).toHaveAttribute('href', '/crisis/flood')
    expect(screen.getByRole('link', { name: /Prepare for an extended power outage/i })).toHaveAttribute('href', '/crisis/power-outage')
  })

  it('shows a hazard-specific checklist and stores progress locally', async () => {
    window.history.replaceState({}, '', '/crisis/flood')
    const { unmount } = render(<AppRouter />)

    expect(await screen.findByRole('heading', { name: 'Prepare for flood' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Household preparation checklist' })).toBeVisible()
    expect(screen.getByText('0 of 5 complete')).toBeVisible()

    fireEvent.click(screen.getByRole('checkbox', { name: /Local flood information reviewed/i }))
    expect(screen.getByText('1 of 5 complete')).toBeVisible()

    unmount()
    render(<AppRouter />)
    expect(await screen.findByRole('checkbox', { name: /Local flood information reviewed/i })).toBeChecked()
  })
})
