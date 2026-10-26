const CACHE_NAME = 'DealerHunt-v3'
const STATIC_CACHE = 'DealerHunt-static-v1'
const DYNAMIC_CACHE = 'DealerHunt-dynamic-v1'

const STATIC_ASSETS = [
  '/offline.html',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/dealerhunt-icon.svg',
  '/brand/DEALERHUNT-D.svg',
  '/favicon.ico',
  '/favicon-16x16.png',
  '/favicon-32x32.png',
  '/apple-touch-icon.png',
  '/apple-touch-icon-120x120.png',
  '/apple-touch-icon-152x152.png',
  '/apple-touch-icon-180x180.png',
  '/safari-pinned-tab.svg',
  '/browserconfig.xml',
  '/images/car-placeholder.jpg',
  '/images/car-placeholder.png'
]

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  )
})

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(cacheName => cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE)
            .map(cacheName => caches.delete(cacheName))
        )
      })
      .then(() => self.clients.claim())
  )
})

// Fetch event - serve from cache with network fallback
async function cachedResponse(request) {
  try { return await caches.match(request) } catch (_) { return undefined }
}

function unavailableResponse() {
  return new Response('Temporarily unavailable. Please retry.', {
    status: 503,
    headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
  })
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return
  }

  // Skip external requests
  if (url.origin !== self.location.origin) {
    return
  }

  // Skip chrome-extension and other non-http requests
  if (!request.url.startsWith('http')) {
    return
  }

  // HTML routes and API responses are session-aware; always prefer the network
  // so login state and fresh server-rendered pages do not get stale cached HTML.
  if (request.mode === 'navigate' || url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(async () => {
        // A worker fetch can fail transiently while the device is online. Retry a navigation once
        // before replacing the screen with offline UI.
        if (request.mode === 'navigate') {
          await new Promise(resolve => setTimeout(resolve, 500))
          try {
            return await fetch(request)
          } catch (_) {
            return (await cachedResponse('/offline.html')) || unavailableResponse()
          }
        }
        return new Response(JSON.stringify({ error: 'Request could not reach DealerHunt. Please retry.' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      })
    )
    return
  }

  const isStaticAsset =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/images/') ||
    STATIC_ASSETS.includes(url.pathname)

  if (!isStaticAsset) {
    return
  }

  event.respondWith(
    cachedResponse(request)
      .then(async response => {
        // Return cached response or fetch from network
        if (response) {
          return response
        }

        return fetch(request)
          .then(response => {
            // Don't cache non-successful responses
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response
            }

            // Clone the response since it can only be consumed once
            const responseToCache = response.clone()

            // Cache dynamic content
            event.waitUntil(caches.open(DYNAMIC_CACHE)
              .then(cache => {
                return cache.put(request, responseToCache)
              }).catch(() => {}))

            return response
          })
          .catch(async () => {
            // A precached icon may differ in request headers from a browser image request.
            if (STATIC_ASSETS.includes(url.pathname)) {
              const cached = await cachedResponse(url.pathname)
              if (cached) return cached
            }
            if (request.destination === 'image') {
              const placeholder = await cachedResponse('/images/car-placeholder.png')
              if (placeholder) return placeholder
            }
            // Never resolve respondWith(undefined) or send HTML in place of scripts.
            return unavailableResponse()
          })
      })
  )
})

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync-watchlist') {
    event.waitUntil(syncWatchlist())
  }
})

// Only ever open an in-app path from a notification ("/deal/123"); anything else falls back to the alerts inbox.
function safeAppPath(url) {
  if (typeof url !== 'string') return '/alerts'
  const u = url.trim()
  if (!u.startsWith('/') || u.startsWith('//') || u.startsWith('/\\') || /[\u0000-\u001f\u007f]/.test(u)) return '/alerts'
  try {
    const target = new URL(u, 'https://push-path.invalid')
    return target.origin === 'https://push-path.invalid' ? target.pathname + target.search + target.hash : '/alerts'
  } catch { return '/alerts' }
}

// Push notification handling
self.addEventListener('push', (event) => {
  let payload = { title: 'DealerHunt', body: 'An alert matched a new listing.', url: '/alerts' }
  try {
    if (event.data) payload = Object.assign(payload, event.data.json())
  } catch (e) {
    if (event.data) payload.body = event.data.text()
  }

  event.waitUntil((async () => {
    let verified = false
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    try {
      if (typeof payload.recipientUserId === 'string') {
        const response = await fetch('/api/auth/whoami', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
        if (response.ok) {
          const viewer = await response.json()
          verified = viewer.verified === true && viewer.id === payload.recipientUserId
        }
      }
    } catch (_) {
      // Never display another account's private alert when identity cannot be verified.
    } finally {
      clearTimeout(timer)
    }
    if (!verified) {
      await self.registration.showNotification('DealerHunt', { body: 'Open DealerHunt to check your alerts.', icon: '/icon-192x192.png', tag: 'account-check', data: { url: '/alerts' } })
      return
    }
  const options = {
    body: payload.body,
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    vibrate: [100, 50, 100],
    tag: payload.tag,
    renotify: !!payload.tag,
    data: { url: safeAppPath(payload.url) },
    actions: [
      { action: 'explore', title: 'View' },
      { action: 'close', title: 'Dismiss' }
    ]
  }

  // Delivery receipt: the push reached this device. Opaque id only (no user data in the URL).
  const receipt =
    typeof payload.deliveryId === 'string' && /^[0-9a-f-]{36}$/i.test(payload.deliveryId)
      ? fetch('/api/t/d/' + payload.deliveryId, { method: 'POST', keepalive: true }).catch(() => {})
      : Promise.resolve()

  await Promise.all([self.registration.showNotification(payload.title, options), receipt])
  })())
})

// Notification tap: open the deal or alert it is about. Reuse a tab already on that page, else steer an open
// DealerHunt tab there, else open a new window (also how an installed app is launched from a cold start).
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  if (event.action === 'close') return
  const path = safeAppPath(event.notification.data && event.notification.data.url)
  const target = new URL(path, self.location.origin).href
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (wins) => {
      const same = wins.find((w) => w.url === target)
      if (same && 'focus' in same) return same.focus()
      for (const w of wins) {
        if (!w.url.startsWith(self.location.origin)) continue
        if ('navigate' in w) {
          try {
            const moved = await w.navigate(target)
            if (moved) return moved.focus()
          } catch (_) {
            /* uncontrolled tab: fall through to a new window */
          }
        }
      }
      return clients.openWindow(target)
    })
  )
})

// The browser rotated or expired this device's push subscription: subscribe again with the same server key
// and re-save it, so alerts keep arriving without the user having to turn them off and on.
self.addEventListener('pushsubscriptionchange', (event) => {
  const old = event.oldSubscription
  const key = old && old.options && old.options.applicationServerKey
  event.waitUntil(
    (event.newSubscription
      ? Promise.resolve(event.newSubscription)
      : key
        ? self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
        : Promise.resolve(null)
    )
      .then((sub) => {
        if (!sub) return
        return fetch('/api/push/subscribe', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sub)
        })
      })
      .catch(() => undefined)
  )
})

// Background sync function
async function syncWatchlist() {
  try {
    const watchlistChanges = await getOfflineWatchlistChanges()

    for (const change of watchlistChanges) {
      await fetch('/api/watchlist', {
        method: change.method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(change.data)
      })
    }

    await clearOfflineWatchlistChanges()

    self.registration.showNotification('Sync Complete', {
      body: 'Your watchlist has been updated',
      icon: '/icon-192x192.png'
    })
  } catch (error) {
    console.error('Background sync failed:', error)
  }
}

// IndexedDB helpers for offline storage
async function getOfflineWatchlistChanges() {
  return []
}

async function clearOfflineWatchlistChanges() {
  return Promise.resolve()
}
