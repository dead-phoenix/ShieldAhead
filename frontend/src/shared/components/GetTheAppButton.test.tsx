import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GetTheAppButton } from './GetTheAppButton'
import * as pwa from '../pwa/pwaInstall'

describe('Get the app button', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('is hidden when the app is already installed', () => {
    vi.spyOn(pwa, 'shouldOfferAppInstall').mockReturnValue(false)

    const { container } = render(<GetTheAppButton />)

    expect(container).toBeEmptyDOMElement()
  })

  it('uses the captured install prompt when available', async () => {
    const prompt = vi.fn(async () => undefined)
    vi.spyOn(pwa, 'shouldOfferAppInstall').mockReturnValue(true)
    vi.spyOn(pwa, 'getDeferredInstallPrompt').mockReturnValue({
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    } as unknown as ReturnType<typeof pwa.getDeferredInstallPrompt>)
    const clear = vi.spyOn(pwa, 'clearDeferredInstallPrompt')

    render(<GetTheAppButton />)
    screen.getByRole('button', { name: 'Get the app' }).click()

    await vi.waitFor(() => {
      expect(prompt).toHaveBeenCalledTimes(1)
      expect(clear).toHaveBeenCalled()
    })
  })
})
