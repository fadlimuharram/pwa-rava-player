/* eslint-env serviceworker */
/*
 * Rava Music service worker.
 *
 * Deliberately hand-written and tiny: the app's real payload is the user's own audio, which
 * lives in IndexedDB and must never be copied into the HTTP cache. All this does is make the
 * app shell available offline.
 *
 * Strategy:
 *   navigation requests -> network first, fall back to the cached shell (so a cold offline
 *                          launch still boots, and a fresh deploy is picked up when online)
 *   /assets/*           -> cache first (Vite hashes these, so a URL never changes meaning)
 *   everything else     -> network, with a cache fallback
 */

const VERSION = 'rava-music-v1'
const SHELL_CACHE = `${VERSION}-shell`
const ASSET_CACHE = `${VERSION}-assets`

const SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // A single failed URL must not abort the whole install, so each one is added on its own.
      .then((cache) => Promise.allSettled(SHELL_URLS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') void self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstShell(request))
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, ASSET_CACHE))
    return
  }

  event.respondWith(networkWithCacheFallback(request, SHELL_CACHE))
})

async function networkFirstShell(request) {
  try {
    const response = await fetch(request)
    const cache = await caches.open(SHELL_CACHE)
    await cache.put('/index.html', response.clone())
    return response
  } catch {
    const cached = (await caches.match('/index.html')) ?? (await caches.match('/'))
    if (cached) return cached
    return new Response('Offline and no cached copy of Rava Music is available.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    })
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) {
    const cache = await caches.open(cacheName)
    await cache.put(request, response.clone())
  }
  return response
}

async function networkWithCacheFallback(request, cacheName) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(cacheName)
      await cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached
    throw new Error('offline')
  }
}
