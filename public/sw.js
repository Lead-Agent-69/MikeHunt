const CACHE_NAME = 'MikeHunt-v3'
const STATIC_CACHE = 'MikeHunt-static-v8'
const DYNAMIC_CACHE = 'MikeHunt-dynamic-v6'

const STATIC_ASSETS = [
  '/offline.html',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/icon.svg',
  '/brand/MIKEHUNT-M.svg',
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
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return
  }

  // Skip external requests
  if (!request.url.startsWith(self.location.origin)) {
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
            return caches.match('/offline.html')
          }
        }
        return new Response(JSON.stringify({ error: 'Request could not reach MIKEHUNT. Please retry.' }), {
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
    caches.match(request)
      .then(response => {
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
            caches.open(DYNAMIC_CACHE)
              .then(cache => {
                cache.put(request, responseToCache)
              })

            return response
          })
          .catch(() => {
            // Handle offline fallback for specific routes
            if (request.url.includes('/discover')) {
              return caches.match('/')
            }

            // Return offline page for navigation requests
            if (request.mode === 'navigate') {
              return caches.match('/offline.html')
            }
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
  if (!u.startsWith('/') || u.startsWith('//') || u.startsWith('/\\')) return '/alerts'
  return u
}

// Push notification handling
self.addEventListener('push', (event) => {
  let payload = { title: 'MikeHunt', body: 'An alert matched a new listing.', url: '/alerts' }
  try {
    if (event.data) payload = Object.assign(payload, event.data.json())
  } catch (e) {
    if (event.data) payload.body = event.data.text()
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

  event.waitUntil(self.registration.showNotification(payload.title, options))
})

// Notification tap: open the deal or alert it is about. Reuse a tab already on that page, else steer an open
// MikeHunt tab there, else open a new window (also how an installed app is launched from a cold start).
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
