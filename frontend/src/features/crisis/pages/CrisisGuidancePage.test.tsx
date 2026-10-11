import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { CrisisGuidancePage } from './CrisisGuidancePage'

function renderGuidance(kind = 'bushfire') {
  return render(
    <MemoryRouter initialEntries={[`/crisis/${kind}/guidance`]}>
      <Routes>
        <Route path="/crisis/:kind/guidance" element={<CrisisGuidancePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('CrisisGuidancePage sources', () => {
  it('lists each cited source once at the bottom of the stage, not after every item', () => {
    renderGuidance()

    // The "before" stage has 5 items but only 4 distinct sources (two items
    // both cite NSW RFS — Neighbourhood Safer Places) — the de-duplicated
    // list, not a per-item repeat, is what should appear.
    const sources = screen.getByRole('heading', { name: 'Sources' }).closest('div')
    expect(sources).not.toBeNull()
    const links = within(sources!).getAllByRole('link')
    const names = links.map((link) => link.textContent)
    expect(names.filter((name) => name?.includes('Neighbourhood Safer Places'))).toHaveLength(1)
    expect(links).toHaveLength(4)
  })

  it('does not render a source link inside each individual guidance item', () => {
    renderGuidance()

    const item = screen.getByRole('heading', { name: 'Write down your bushfire plan' }).closest('article')
    expect(item).not.toBeNull()
    expect(within(item!).queryByRole('link')).not.toBeInTheDocument()
  })
})
