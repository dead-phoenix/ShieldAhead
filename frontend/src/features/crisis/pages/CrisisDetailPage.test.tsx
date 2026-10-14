import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CrisisDetailPage } from './CrisisDetailPage'

function renderDetail(kind = 'bushfire') {
  return render(
    <MemoryRouter initialEntries={[`/crisis/${kind}`]}>
      <Routes>
        <Route path="/crisis/:kind" element={<CrisisDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function itemContainer(label: string): HTMLElement {
  return screen.getByRole('checkbox', { name: label }).closest('.crisis-checklist__item') as HTMLElement
}

describe('CrisisDetailPage checklist', () => {
  beforeEach(() => {
    window.localStorage.clear()
    // The bundled checklist/helplines show immediately regardless of this —
    // stubbed just so the background API-refresh fetch doesn't hit the
    // network or log an unhandled rejection in the test run.
    vi.spyOn(window, 'fetch').mockRejectedValue(new Error('offline in this test'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows each step as its own checkbox, not one combined sentence', () => {
    renderDetail()

    const item = itemContainer('Pack an emergency kit')
    const itemBox = screen.getByRole('checkbox', { name: 'Pack an emergency kit' })
    const subBoxes = within(item).getAllByRole('checkbox').filter((box) => box !== itemBox)
    expect(subBoxes.map((box) => box.closest('label')?.textContent)).toEqual([
      'Water', 'Torch', 'Batteries', 'First-aid items', 'Charged power bank', 'Medication', 'Food',
      'Keep the kit somewhere everyone can grab it',
    ])
  })

  it('auto-ticks the item once every one of its sub-steps is checked', () => {
    renderDetail()

    const item = itemContainer('Pack an emergency kit')
    const itemBox = screen.getByRole('checkbox', { name: 'Pack an emergency kit' })
    const subBoxes = within(item).getAllByRole('checkbox').filter((box) => box !== itemBox)
    expect(itemBox).not.toBeChecked()

    subBoxes.slice(0, -1).forEach((box) => fireEvent.click(box))
    expect(itemBox).not.toBeChecked()

    fireEvent.click(subBoxes[subBoxes.length - 1])
    expect(itemBox).toBeChecked()
  })

  it('clicking the item checkbox checks every sub-step, and clicking it again clears them all', () => {
    renderDetail()

    const item = itemContainer('Pack an emergency kit')
    const itemBox = screen.getByRole('checkbox', { name: 'Pack an emergency kit' })
    const subBoxes = within(item).getAllByRole('checkbox').filter((box) => box !== itemBox)

    fireEvent.click(itemBox)
    expect(itemBox).toBeChecked()
    subBoxes.forEach((box) => expect(box).toBeChecked())

    fireEvent.click(itemBox)
    expect(itemBox).not.toBeChecked()
    subBoxes.forEach((box) => expect(box).not.toBeChecked())
  })

  it('saves the checklist on request and confirms it', () => {
    renderDetail()

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save checklist' }))
    expect(screen.getByRole('status')).toHaveTextContent('Checklist saved on this device.')
  })

  it('steps through the hazards in order, with a download link on every page', () => {
    renderDetail('bushfire')

    expect(screen.queryByRole('link', { name: /Back to .*checklist/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Next: Flood checklist/ })).toHaveAttribute('href', '/crisis/flood')
    expect(screen.getByRole('link', { name: 'Download this checklist' })).toHaveAttribute('href', '/emergency-pack?crisis=bushfire')
    expect(screen.queryByRole('link', { name: 'Download all 3 checklists' })).not.toBeInTheDocument()
  })

  it('offers a way back and forward on the middle hazard page', () => {
    renderDetail('flood')

    expect(screen.getByRole('link', { name: /Back to Bushfire checklist/ })).toHaveAttribute('href', '/crisis/bushfire')
    expect(screen.getByRole('link', { name: /Next: Power outage checklist/ })).toHaveAttribute('href', '/crisis/power-outage')
    expect(screen.getByRole('link', { name: 'Download this checklist' })).toHaveAttribute('href', '/emergency-pack?crisis=flood')
    expect(screen.queryByRole('link', { name: 'Download all 3 checklists' })).not.toBeInTheDocument()
  })

  it('offers only Back and both download options on the last hazard page', () => {
    renderDetail('power-outage')

    expect(screen.getByRole('link', { name: /Back to Flood checklist/ })).toHaveAttribute('href', '/crisis/flood')
    expect(screen.queryByRole('link', { name: /^Next:/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Download this checklist' })).toHaveAttribute('href', '/emergency-pack?crisis=power-outage')
    expect(screen.getByRole('link', { name: 'Download all 3 checklists' })).toHaveAttribute('href', '/emergency-pack?crisis=all')
  })
})
