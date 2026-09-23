/* Corridor Intelligence — service worker
 * Scope: site root ("/"). Served by Caddy from the droplet root so it can
 * control every page (theme assets live under /assets/ and cannot claim root scope).
 * Strategy:
 *   - navigations  -> network-first, fall back to the cached copy (last-read), then /offline.html
 *   - static files -> stale-while-revalidate
 *   - Ghost members / admin / api / portal -> always network (never cache auth)
 * Bump CACHE_VERSION on any change to force a clean update.
 */
'use strict';

const CACHE_VERSION = 'corridor-v1';
const SHELL_CACHE   = `${CACHE_VERSION}-shell`;
const PAGES_CACHE   = `${CACHE_VERSION}-pages`;
const ASSETS_CACHE  = `${CACHE_VERSION}-assets`;
const PAGES_MAX     = 40;   // cap the last-read store

// App shell — kept intentionally small.
const SHELL = [
  '/assets/offline.html',
  '/assets/manifest.webmanifest',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png'
];

// Never touch these — they are auth / dynamic and must always hit the network.
const BYPASS = [
  '/ghost/', '/members/', '/webmentions/', '/r/', '/.well-known/',
  '/content/', '/p/', '/email/'
];

function isBypass(url) {
  return BYPASS.some(function (p) { return url.pathname.indexOf(p) === 0; });
}

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

// ---- install: precache the shell ----
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(function (c) { return c.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

// ---- activate: drop old caches, take control ----
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (n) {
        if (n.indexOf(CACHE_VERSION) !== 0) return caches.delete(n);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

// ---- fetch router ----
self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // Let auth/dynamic Ghost endpoints pass straight through.
  if (sameOrigin && isBypass(url)) return;

  // Navigations -> network-first, cache the result as last-read, offline fallback.
  if (req.mode === 'navigate') {
    event.respondWith(networkFirstPage(req));
    return;
  }

  // Same-origin static assets -> stale-while-revalidate.
  if (sameOrigin && /\.(?:css|js|png|jpg|jpeg|webp|svg|gif|ico|woff2?|ttf)$/.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(req, ASSETS_CACHE));
    return;
  }

  // Google Fonts (cross-origin) -> cache-first, they are immutable.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(req, ASSETS_CACHE));
    return;
  }
  // everything else: default network
});

async function networkFirstPage(req) {
  const cache = await caches.open(PAGES_CACHE);
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok && fresh.type === 'basic') {
      cache.put(req, fresh.clone());
      trimCache(PAGES_CACHE, PAGES_MAX);
    }
    return fresh;
  } catch (err) {
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    const shell = await caches.open(SHELL_CACHE);
    return (await shell.match('/assets/offline.html')) || Response.error();
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const network = fetch(req).then(function (res) {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  }).catch(function () { return cached; });
  return cached || network;
}

// ---- update handshake (theme calls this to activate a waiting SW) ----
self.addEventListener('message', function (event) {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

/* ---------------------------------------------------------------------------
 * WEB PUSH — scaffolded, delivery OFF until VAPID keys + a sender are set on
 * the droplet (see PWA_DEPLOY_GUIDE §5). Handlers are safe to ship inert:
 * with no push subscription and no sender, nothing fires.
 * iOS note: web push is delivered ONLY to an installed PWA (iOS 16.4+).
 * ------------------------------------------------------------------------- */
self.addEventListener('push', function (event) {
  let data = { title: 'Corridor Intelligence', body: 'New dispatch published.', url: '/' };
  try { if (event.data) data = Object.assign(data, event.data.json()); } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/assets/icons/icon-192.png',
      badge: '/assets/icons/icon-192.png',
      data: { url: data.url || '/' },
      tag: data.tag || 'corridor'
    })
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (const c of list) { if ('focus' in c) { c.navigate(target); return c.focus(); } }
      return self.clients.openWindow(target);
    })
  );
});
