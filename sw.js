const CACHE = 'ns-v3';
const SHELL = ['./', 'index.html', 'schedule.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'badge-96.png', 'tips.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// 네트워크 먼저, 안 되면 저장본 (오프라인에서도 열림)
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});

self.addEventListener('push', e => {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch (_) { p = { title: '퐁당퐁당 나이트', body: e.data && e.data.text() }; }
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const visible = wins.filter(w => w.visibilityState === 'visible');
    if (visible.length) { visible.forEach(w => w.postMessage({ type: 'ns-push', payload: p })); return; }
    await self.registration.showNotification(p.title || '퐁당퐁당 나이트', {
      body: p.body || '', tag: p.tag || 'ns', renotify: true, requireInteraction: true,
      icon: 'icon-192.png', badge: 'badge-96.png', vibrate: [300, 150, 300, 150, 600], data: p, lang: 'ko'
    });
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const isLetter = e.notification.data && e.notification.data.kind === 'letter';
    for (const w of wins) {
      if ('focus' in w) { if (isLetter) w.postMessage({ type: 'ns-push', payload: e.notification.data }); return w.focus(); }
    }
    return self.clients.openWindow(isLetter ? './#letter' : './');
  })());
});
