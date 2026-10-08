import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LazyLoadBoundary } from './LazyLoadBoundary'

function Thrower(): never {
  throw new Error('chunk failed to load')
}

describe('LazyLoadBoundary', () => {
  it('renders children normally when nothing fails', () => {
    render(
      <LazyLoadBoundary fallback={<p>fallback shown</p>}>
        <p>real content</p>
      </LazyLoadBoundary>,
    )
    expect(screen.getByText('real content')).toBeVisible()
    expect(screen.queryByText('fallback shown')).not.toBeInTheDocument()
  })

  it('renders the fallback instead of crashing the rest of the page when a child throws', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <div>
        <p>sibling content stays mounted</p>
        <LazyLoadBoundary fallback={<p>fallback shown</p>}>
          <Thrower />
        </LazyLoadBoundary>
      </div>,
    )
    expect(screen.getByText('fallback shown')).toBeVisible()
    expect(screen.getByText('sibling content stays mounted')).toBeVisible()
    consoleError.mockRestore()
  })
})
