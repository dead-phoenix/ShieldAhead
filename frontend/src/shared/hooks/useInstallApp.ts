import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<unknown>
}

function isRunningInstalled(): boolean {
  if (typeof window === 'undefined') return false
  const standaloneNavigator = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia?.('(display-mode: standalone)').matches === true || standaloneNavigator.standalone === true
}

function isIosBrowser(): boolean {
  return typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)
}

/** Lets someone install ShieldAhead to their home screen, so the app and its
 * crisis pages open with no signal after it has been installed online once. */
export function useInstallApp() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent>()
  const [installed, setInstalled] = useState(isRunningInstalled)

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstallPrompt(undefined)
      setInstalled(true)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  async function install() {
    if (!installPrompt) return
    await installPrompt.prompt()
    setInstallPrompt(undefined)
  }

  return {
    canInstall: Boolean(installPrompt) && !installed,
    showIosHint: !installed && isIosBrowser(),
    install: () => void install(),
  }
}
