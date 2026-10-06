import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useInstallApp } from './useInstallApp'

function fireBeforeInstallPrompt(prompt = vi.fn().mockResolvedValue({ outcome: 'accepted' })) {
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt })
  act(() => {
    window.dispatchEvent(event)
  })
  return prompt
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useInstallApp', () => {
  it('offers no install button until the browser says the app can be installed', () => {
    const { result } = renderHook(() => useInstallApp())
    expect(result.current.canInstall).toBe(false)
  })

  it('offers install once the browser fires its install prompt', () => {
    const { result } = renderHook(() => useInstallApp())
    fireBeforeInstallPrompt()
    expect(result.current.canInstall).toBe(true)
  })

  it('calls the browser prompt when install is pressed, then hides the button', async () => {
    const { result } = renderHook(() => useInstallApp())
    const prompt = fireBeforeInstallPrompt()

    act(() => result.current.install())

    expect(prompt).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(result.current.canInstall).toBe(false))
  })

  it('hides the button after the app is installed', () => {
    const { result } = renderHook(() => useInstallApp())
    fireBeforeInstallPrompt()
    act(() => {
      window.dispatchEvent(new Event('appinstalled'))
    })
    expect(result.current.canInstall).toBe(false)
  })

  it('shows the iPhone hint on iOS browsers, since they have no install prompt', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')
    const { result } = renderHook(() => useInstallApp())
    expect(result.current.showIosHint).toBe(true)
  })
})
