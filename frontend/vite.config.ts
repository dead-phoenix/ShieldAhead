import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

function writeCoverageCount(fileUrl: URL, count: number) {
  const filePath = fileURLToPath(fileUrl)
  const next = `${JSON.stringify({ count }, null, 2)}\n`
  let previous = ''
  try {
    previous = readFileSync(filePath, 'utf8')
  } catch {
    // A missing snapshot is equivalent to an empty previous value.
  }
  if (previous !== next) writeFileSync(filePath, next)
}

function coverageJsonSnapshot(): Plugin {
  const skip = Boolean(process.env.VITEST) || process.argv.some((arg) => arg.includes('vitest'))

  async function refreshFromPipeline() {
    if (skip) return
    try {
      const response = await fetch('http://127.0.0.1:5001/api/stats', {
        signal: AbortSignal.timeout(2500),
      })
      if (!response.ok) return
      const stats = (await response.json()) as {
        wifiLocations?: number
        supportServices?: number
      }
      writeCoverageCount(
        new URL('./src/data/coverage/wifi.json', import.meta.url),
        Number(stats.wifiLocations) || 0,
      )
      writeCoverageCount(
        new URL('./src/data/coverage/charities.json', import.meta.url),
        Number(stats.supportServices) || 0,
      )
    } catch {
      // Keep the last snapshot when the API is offline during build or dev startup.
    }
  }

  return {
    name: 'coverage-json-snapshot',
    buildStart() {
      return refreshFromPipeline()
    },
    configureServer() {
      void refreshFromPipeline()
    },
  }
}

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
        '/icon-192.png',
        '/icon-512.png',
        '/apple-touch-icon.png',
        ...Object.keys(bundle).map((fileName) => `/${fileName}`),
      ]
      const source = `const CACHE_NAME = 'shieldahead-shell-v4'
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
  const requestUrl = new URL(event.request.url)
  if (event.request.method !== 'GET' || requestUrl.origin !== self.location.origin) return
  if (requestUrl.pathname.startsWith('/api/')) return
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
  plugins: [react(), coverageJsonSnapshot(), shieldAheadServiceWorker()],
})
