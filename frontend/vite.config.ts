import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const rootDir = dirname(fileURLToPath(import.meta.url))

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

/** Every file under `publicRoot/<dir>` for each dir in `dirs`, as `/`-rooted
 * published paths — used to precache public/ folders that never pass
 * through Rollup's bundle (images, the offline data JSON). */
function publicAssetFiles(dirs: string[]): string[] {
  const publicRoot = resolve(rootDir, 'public')
  const files: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else files.push(`/${relative(publicRoot, full).split(sep).join('/')}`)
    }
  }
  for (const dir of dirs) {
    const full = resolve(publicRoot, dir)
    if (existsSync(full)) walk(full)
  }
  return files
}

function shieldAheadServiceWorker(): Plugin {
  return {
    name: 'shieldahead-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      // MapLibre is ~1.5MB and useless offline without map tiles anyway — it's
      // cached at runtime instead (the generic fetch handler below) if the
      // map is opened while online, never forced into every install.
      const isMapLibreChunk = (fileName: string) => fileName.includes('maplibre-gl')
      const bundleFiles = Object.keys(bundle)
        .filter((fileName) => !isMapLibreChunk(fileName))
        .map((fileName) => `/${fileName}`)

      const precacheFiles = [
        '/',
        '/index.html',
        '/manifest.webmanifest',
        '/favicon.svg',
        '/icon-192.png',
        '/icon-512.png',
        '/apple-touch-icon.png',
        ...bundleFiles,
        ...publicAssetFiles(['images', 'assets/crisis', 'data']),
      ]

      // Derived from the precache list itself, so any change to which
      // files are precached (a new public/ asset, a changed data file)
      // automatically invalidates old installs — no version number to
      // remember to bump by hand.
      const cacheHash = createHash('sha256').update(JSON.stringify(precacheFiles)).digest('hex').slice(0, 12)
      const cacheName = `shieldahead-shell-${cacheHash}`

      const source = `const CACHE_NAME = ${JSON.stringify(cacheName)}
const PRECACHE_FILES = ${JSON.stringify(precacheFiles)}
const SHELL_URL = '/index.html'
// How long a navigation gets to answer from the network before falling back
// to the cached shell — guards against a slow/sleeping Render instance
// hanging the whole page load (not just a genuinely offline fetch, which
// rejects immediately on its own).
const NAVIGATION_TIMEOUT_MS = 3000

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    const results = await Promise.allSettled(
      PRECACHE_FILES.map(async (url) => {
        const response = await fetch(url, { cache: 'no-cache' })
        if (!response.ok) throw new Error('precache fetch failed: ' + url)
        await cache.put(url, response)
      }),
    )
    // One failed file (a flaky request, a stale manifest entry) must not
    // fail the whole install — only the app shell itself is required, since
    // nothing works offline at all without it.
    const shellIndex = PRECACHE_FILES.indexOf(SHELL_URL)
    if (shellIndex !== -1 && results[shellIndex].status === 'rejected') {
      throw results[shellIndex].reason
    }
  })())
  // No self.skipWaiting() here — the new worker waits until the page asks
  // it to take over (see the 'message' listener below), so an update never
  // swaps the running app out from under someone mid-session.
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))))
  self.clients.claim()
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

function isScriptOrStyleUrl(pathname) {
  return pathname.endsWith('.js') || pathname.endsWith('.css')
}

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url)
  if (event.request.method !== 'GET' || requestUrl.origin !== self.location.origin) return
  if (requestUrl.pathname.startsWith('/api/')) return

  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), NAVIGATION_TIMEOUT_MS)
        try {
          const response = await fetch(event.request, { signal: controller.signal })
          return response
        } finally {
          clearTimeout(timeout)
        }
      } catch {
        return (await caches.match(SHELL_URL)) || (await caches.match(event.request)) || Response.error()
      }
    })())
    return
  }

  event.respondWith((async () => {
    const cached = await caches.match(event.request)
    if (cached) return cached
    const response = await fetch(event.request)
    // Never let an HTML error/fallback page (e.g. a dev-server catch-all)
    // get cached under a .js/.css URL — a future offline load would then
    // execute HTML as a script and break silently.
    const contentType = response.headers.get('content-type') || ''
    const looksLikeMiscachedHtml = isScriptOrStyleUrl(requestUrl.pathname) && contentType.includes('text/html')
    if (response.ok && !looksLikeMiscachedHtml) {
      const cache = await caches.open(CACHE_NAME)
      void cache.put(event.request, response.clone())
    }
    return response
  })())
})
`
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), coverageJsonSnapshot(), shieldAheadServiceWorker()],
  resolve: {
    alias: [
      { find: '@', replacement: resolve(rootDir, 'src') },
    ],
  },
})
