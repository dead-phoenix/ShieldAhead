const listeners = new Set<() => void>()
let waitingWorker: ServiceWorker | null = null
let registered = false

function notify() {
  listeners.forEach((listener) => listener())
}

function trackWaiting(registration: ServiceWorkerRegistration) {
  // Only a true update counts — a first-ever install also has a "waiting"
  // worker for a moment, but there's no running controller yet to replace.
  if (registration.waiting && navigator.serviceWorker.controller) {
    waitingWorker = registration.waiting
    notify()
  }
}

/** Registers the service worker and watches for an update becoming ready,
 * without ever swapping the running app out from under someone — the new
 * worker waits until applyServiceWorkerUpdate() is called. */
export function registerServiceWorkerUpdates() {
  if (registered || !('serviceWorker' in navigator)) return
  registered = true

  navigator.serviceWorker.register('/sw.js').then((registration) => {
    trackWaiting(registration)
    registration.addEventListener('updatefound', () => {
      const installing = registration.installing
      installing?.addEventListener('statechange', () => {
        if (installing.state === 'installed') trackWaiting(registration)
      })
    })
  }).catch(() => {
    // The online app remains usable when service-worker registration fails.
  })

  let hasReloaded = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hasReloaded) return
    hasReloaded = true
    window.location.reload()
  })
}

export function subscribeServiceWorkerUpdate(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function hasWaitingServiceWorkerUpdate(): boolean {
  return waitingWorker !== null
}

/** Tells the waiting worker to take over; the page reloads once it does
 * (see the controllerchange listener above). */
export function applyServiceWorkerUpdate() {
  waitingWorker?.postMessage({ type: 'SKIP_WAITING' })
}
