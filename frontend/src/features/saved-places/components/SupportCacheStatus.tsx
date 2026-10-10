import { ArrowClockwise, CloudArrowDown } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { refreshSupportAreaCache } from '../../../data/offline/supportAreaCache'
import type { SupportAreaCacheState } from '../../../data/offline/useSupportAreaCache'
import { useOnlineStatus } from '../../../shared/hooks/useOnlineStatus'
import { describeSupportCache } from '../supportCacheCopy'
import '../SavedPlaces.css'

interface SupportCacheStatusProps {
  state: SupportAreaCacheState
  /** 'refresh' always offers the button; 'save-now' only when nothing is saved. */
  action?: 'save-now' | 'refresh'
}

export function SupportCacheStatus({ state, action = 'save-now' }: SupportCacheStatusProps) {
  const isOnline = useOnlineStatus()
  const isSaving = state.activity === 'saving'
  const showButton = Boolean(state.area) && !state.isReading && (action === 'refresh' || !state.cache)
  const label = action === 'refresh' ? 'Refresh' : 'Save now'

  return (
    <div className="support-cache-status">
      <p role="status">{describeSupportCache(state)}</p>
      {!state.area ? <Link className="button button--quiet button--compact" to={appRoutes.myArea}>Set My area</Link> : null}
      {showButton ? (
        <>
          <button
            className="button button--quiet button--compact"
            type="button"
            disabled={!isOnline || isSaving}
            onClick={() => void refreshSupportAreaCache({ force: true })}
          >
            {action === 'refresh' ? <ArrowClockwise aria-hidden="true" size={17} /> : <CloudArrowDown aria-hidden="true" size={17} />}
            {' '}{isSaving ? 'Saving…' : label}
          </button>
          {!isOnline ? <small>Needs an internet connection</small> : null}
        </>
      ) : null}
    </div>
  )
}
