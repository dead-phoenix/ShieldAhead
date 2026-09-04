import { useEffect, useId, useState } from 'react'
import { DeviceMobile, Export, X } from '@phosphor-icons/react'
import {
  clearDeferredInstallPrompt,
  getDeferredInstallPrompt,
  isIosSafari,
  shouldOfferAppInstall,
  subscribePwaInstall,
} from '../pwa/pwaInstall'

type GetTheAppButtonProps = {
  variant?: 'header' | 'footer'
}

export function GetTheAppButton({ variant = 'header' }: GetTheAppButtonProps) {
  const titleId = useId()
  const [visible, setVisible] = useState(() => shouldOfferAppInstall())
  const [helpMode, setHelpMode] = useState<'ios' | 'generic' | null>(null)

  useEffect(() => {
    const sync = () => setVisible(shouldOfferAppInstall())
    sync()
    return subscribePwaInstall(sync)
  }, [])

  if (!visible) return null

  async function handleClick() {
    const promptEvent = getDeferredInstallPrompt()
    if (promptEvent) {
      await promptEvent.prompt()
      await promptEvent.userChoice
      clearDeferredInstallPrompt()
      setVisible(shouldOfferAppInstall())
      return
    }

    setHelpMode(isIosSafari() ? 'ios' : 'generic')
  }

  return (
    <>
      <button
        className={variant === 'footer' ? 'button button--primary get-app-footer' : 'header-auth__login'}
        type="button"
        onClick={() => void handleClick()}
      >
        <DeviceMobile aria-hidden="true" size={variant === 'footer' ? 18 : 16} />
        Get the app
      </button>
      {helpMode ? (
        <div className="install-modal" role="presentation" onClick={() => setHelpMode(null)}>
          <div
            className="install-modal__panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(event) => event.stopPropagation()}
          >
            <button className="install-modal__close" type="button" onClick={() => setHelpMode(null)}>
              Close
            </button>
            <h2 id={titleId}>Add ShieldAhead to your home screen</h2>
            {helpMode === 'ios' ? (
              <p>
                <Export aria-hidden="true" size={18} /> Tap the Share icon, then “Add to Home Screen”.
              </p>
            ) : (
              <p>Use your browser menu to install ShieldAhead. On Android Chrome, choose Install app.</p>
            )}
          </div>
        </div>
      ) : null}
    </>
  )
}
