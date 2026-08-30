import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WifiVerificationBadge } from './WifiVerificationBadge'

describe('Wi-Fi verification badge', () => {
  it('labels an official listing without promising live availability', () => {
    render(<WifiVerificationBadge status="confirmed" />)

    expect(screen.getByText('Confirmed Wi-Fi listing')).toBeVisible()
  })

  it('makes inferred Wi-Fi uncertainty explicit', () => {
    render(<WifiVerificationBadge status="likely" />)

    expect(screen.getByText('Wi-Fi likely — check first')).toBeVisible()
  })

  it('does not invent a status when older data omits the field', () => {
    const { container } = render(<WifiVerificationBadge status={undefined} />)

    expect(container).toBeEmptyDOMElement()
  })
})
