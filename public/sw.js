// Bump this whenever the app shell changes meaningfully.
const VERSION = 'v15';
const STATIC_CACHE = `zings-static-${VERSION}`;
const RUNTIME_CACHE = `zings-runtime-${VERSION}`;

// Minimal app shell — the document itself is fetched network-first, so we don't precache it.
const SHELL_ASSETS = [
  '/manifest.json',
  '/brand-icon.png',
  '/favicon.ico',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-192-maskable.png',
  '/icon-512-maskable.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((n) => n !== STATIC_CACHE && n !== RUNTIME_CACHE)
          .map((n) => caches.delete(n)),
      ),
    ).then(() => self.clients.claim()),
  );
});


// Share Target handler — POST /share-target lands here, we redirect into the SPA with query params.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(handleShareTarget(request));
    return;
  }

  if (request.method !== 'GET') return;

  // Never intercept the PocketBase API, its admin UI or live updates.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_/')) {
    return;
  }

  // Navigations — network-first so deploys are picked up instantly, fall back to cached shell offline.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  // Same-origin static assets — stale-while-revalidate.
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const title = formData.get('title') || '';
    const text = formData.get('text') || '';
    const link = formData.get('url') || '';
    const combined = [title, text, link].filter(Boolean).join(' ').trim();
    const params = new URLSearchParams();
    if (combined) params.set('share', combined);
    return Response.redirect(`/?${params.toString()}`, 303);
  } catch {
    return Response.redirect('/', 303);
  }
}

async function networkFirstNavigation(request) {
  try {
    const fresh = await fetch(request);
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put('/', fresh.clone()).catch(() => {});
    return fresh;
  } catch {
    const cached = (await caches.match(request)) || (await caches.match('/'));
    if (cached) return cached;
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.status === 200 && response.type === 'basic') {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    })
    .catch(() => null);
  return cached || (await network) || new Response('Offline', { status: 503 });
}

// Push reminders arrive without a payload: ask Zings what this device should show.
self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let items = [];
    try {
      const subscription = await self.registration.pushManager.getSubscription();
      const res = await fetch('/api/push/inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription && subscription.endpoint }),
      });
      items = (await res.json()).items || [];
    } catch (err) {
      // Offline or server down: still show something, browsers require it.
    }
    if (items.length === 0) items = [{ title: 'Zings', body: 'A to-do is due now', tag: 'zings-reminder' }];
    await Promise.all(items.map((item) => self.registration.showNotification(item.title, {
      body: item.body,
      tag: item.tag,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
    })));
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (windows.length > 0) return windows[0].focus();
    return self.clients.openWindow('/');
  })());
});
