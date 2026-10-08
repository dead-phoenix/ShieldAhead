import { useEffect, useState } from 'react'
import {
  applyServiceWorkerUpdate,
  hasWaitingServiceWorkerUpdate,
  subscribeServiceWorkerUpdate,
} from '../pwa/serviceWorkerUpdate'

export function useServiceWorkerUpdate() {
  const [hasUpdate, setHasUpdate] = useState(hasWaitingServiceWorkerUpdate)

  useEffect(() => subscribeServiceWorkerUpdate(() => setHasUpdate(hasWaitingServiceWorkerUpdate())), [])

  return { hasUpdate, reload: applyServiceWorkerUpdate }
}
