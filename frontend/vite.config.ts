import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

function shieldAheadServiceWorker(): Plugin {
  return {
    name: 'shieldahead-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const precacheFiles = [
        '/',
        '/index.html',
        '/manifest.webmanifest',
        '/favicon.svg',
        ...Object.keys(bundle).map((fileName) => `/${fileName}`),
      ]
      const source = `const CACHE_NAME = 'shieldahead-shell-v2'
const PRECACHE_FILES = ${JSON.stringify(precacheFiles)}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_FILES)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))))
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/index.html')))
    return
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()))
    return response
  })))
})
`
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), shieldAheadServiceWorker()],
})
