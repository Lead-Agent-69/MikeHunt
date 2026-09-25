const CACHE_NAME = 'dealerhunt-v2'
const STATIC_CACHE = 'dealerhunt-static-v2'
const DYNAMIC_CACHE = 'dealerhunt-dynamic-v2'

const STATIC_ASSETS = [
  '/',
  '/find',
  '/manifest.json',
  '/_next/static/css/app/layout.css',
  '/_next/static/css/app/globals.css',
  '/icon-192x192.png',
  '/icon-512x512.png'
]

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...')
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('Service Worker: Caching static assets')
        return cache.addAll(STATIC_ASSETS)
      })
      .then(() => self.skipWaiting())
  )
})

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...')
  
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
              console.log('Service Worker: Deleting old cache', cacheName)
              return caches.delete(cacheName)
            }
          })
        )
      })
      .then(() => self.clients.claim())
  )
})

// Fetch event - serve from cache with network fallback
self.addEventListener('fetch', (event) => {
  const { request } = event
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return
  }
  
  // Skip external requests
  if (!request.url.startsWith(self.location.origin)) {
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
            if (request.url.includes('/find')) {
              return caches.match('/')
            }

            // Return offline page for navigation requests
            if (request.mode === 'navigate') {
              return caches.match('/offline.html') ||
                new Response('Offline - Please check your connection', {
                  status: 503,
                  statusText: 'Service Unavailable'
                })
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

// Push notification handling
self.addEventListener('push', (event) => {
  // Payload is JSON { title, body, url, tag }; fall back to plain text for older senders.
  let payload = { title: 'DealerHunt', body: 'New deal matches found', url: '/feed' }
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
    data: { url: payload.url || '/feed' },
    actions: [
      { action: 'explore', title: 'View' },
      { action: 'close', title: 'Dismiss' }
    ]
  }

  event.waitUntil(self.registration.showNotification(payload.title, options))
})

// Notification click → focus an existing tab (navigating it to the target) or open a new one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  if (event.action === 'close') return
  const url = (event.notification.data && event.notification.data.url) || '/feed'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) {
          if ('navigate' in w) w.navigate(url)
          return w.focus()
        }
      }
      return clients.openWindow(url)
    })
  )
})

// Background sync function
async function syncWatchlist() {
  try {
    // Sync watchlist changes made while offline
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
    
    // Clear offline changes after successful sync
    await clearOfflineWatchlistChanges()
    
    // Show notification about successful sync
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
  // This would integrate with IndexedDB to get offline changes
  return []
}

async function clearOfflineWatchlistChanges() {
  // This would clear offline changes from IndexedDB
  return Promise.resolve()
}
