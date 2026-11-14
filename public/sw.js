// NYVEN service worker.
// __NYVEN_BUILD_ID__ is replaced at build time by the nyvenSwVersion plugin in
// vite.config.ts, so every build gets its own cache and old caches are dropped.
const BUILD_ID = '__NYVEN_BUILD_ID__'
const CACHE_PREFIX = 'nyven-shell-'
const CACHE = CACHE_PREFIX + BUILD_ID

const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/nyven-icon-192.png',
  '/nyven-icon-512.png',
  '/nyven-icon-maskable-192.png',
  '/nyven-icon-maskable-512.png',
  '/apple-touch-icon.png',
]

// No skipWaiting() here: a new version waits until the person taps Refresh in
// the update banner (which posts SKIP_WAITING), so a chat is never reloaded under them.
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      // `reload` bypasses the HTTP cache so the shell is always fresh from the network
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  )
})

function isNavigation(req) {
  return (
    req.mode === 'navigate' ||
    (req.method === 'GET' && (req.headers.get('accept') || '').includes('text/html'))
  )
}

function putInCache(req, res) {
  const clone = res.clone()
  caches.open(CACHE).then((c) => c.put(req, clone)).catch(() => {})
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // Never cache or intercept the API (auth, chat, voice, data all go straight to the network)
  if (url.pathname.startsWith('/api/')) return

  // Network-first for navigations and index.html
  if (isNavigation(req) || url.pathname === '/' || url.pathname === '/index.html') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) putInCache(req, res)
          return res
        })
        .catch(() =>
          caches
            .match(req)
            .then((c) => c || caches.match('/index.html'))
            .then((c) => c || caches.match('/'))
        )
    )
    return
  }

  // Cache-first only for hashed Vite build assets
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached
        return fetch(req).then((res) => {
          // Never cache an HTML fallback served in place of a missing asset
          const type = (res && res.headers.get('content-type')) || ''
          if (res && res.ok && !type.includes('text/html')) putInCache(req, res)
          return res
        })
      })
    )
    return
  }

  // Other static files: network-first, cache fallback
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok && (url.pathname.endsWith('.png') || url.pathname.endsWith('.webmanifest'))) {
          putInCache(req, res)
        }
        return res
      })
      .catch(() => caches.match(req))
  )
})

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
