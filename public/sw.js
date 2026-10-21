// Service worker: app instalable + avisos push (Android, iPhone y ordenador)
const CACHE = 'garra-v3';
const SHELL = ['/', '/escudo.png', '/icon-192.png', '/icon-512.png', '/badge.png', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

// Red primero (los datos siempre frescos); si no hay conexión, se abre la última versión guardada. Nunca se guarda /api.
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== self.location.origin || u.pathname.startsWith('/api/') || u.pathname === '/healthz') return;
  e.respondWith((async () => {
    try {
      const res = await fetch(r);
      if (res.ok) { const c = await caches.open(CACHE); c.put(r, res.clone()); }
      return res;
    } catch (err) {
      const hit = await caches.match(r, { ignoreSearch: true }) || (r.mode === 'navigate' ? await caches.match('/') : null);
      return hit || Response.error();
    }
  })());
});

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Real Garra Balonpié', {
    body: d.body || '',
    icon: '/icon-192.png',
    badge: '/badge.png',
    tag: d.tag || 'garra',
    renotify: true,
    vibrate: [120, 60, 120, 60, 240],
    timestamp: Date.now(),
    lang: 'es',
    data: { url: d.url || '/' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) {
      if (c.url.startsWith(self.location.origin)) {
        try { await c.focus(); if ('navigate' in c) await c.navigate(url); } catch {}
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
