/* Service worker: the app works fully offline, and checks once a day what needs attention (notifications). */
const VERSION = 'macaisse-v15';
const SHELL = ['./', './index.html', './app.css', './i18n.js', './core.js', './notify-core.js', './qr.js', './security.js', './cloud.js', './print.js', './ifb.js', './auto.js', './roles.js', './app.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

importScripts('./i18n.js', './notify-core.js');   // TR + mcDue / mcOrderPlan (no screen code)

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== 'macaisse-ocr').map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Reading engine (OCR) files: kept after the first download.
  if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(caches.open('macaisse-ocr').then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }

  if (url.origin !== location.origin) return;
  // Backup server on the same address: never cache it (a stale copy could be restored).
  if (/\/(backup|health)$|\/ifb\//.test(url.pathname) || req.headers.has('Authorization')) return;

  // App: cache first, update in the background.
  e.respondWith(caches.open(VERSION).then(async c => {
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(new Request(req.url, { cache: 'no-cache' })).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => null);
    if (hit) return hit;
    const res = await net;
    return res || c.match('./index.html');
  }));
});

/* ---------- Daily check & notifications ---------- */
function idb(store, mode, fn) {
  return new Promise((res, rej) => {
    const o = indexedDB.open('macaissepro', 1);
    o.onupgradeneeded = () => { o.result.createObjectStore('kv'); o.result.createObjectStore('photos'); };
    o.onerror = () => rej(o.error);
    o.onsuccess = () => { const db = o.result, tx = db.transaction(store, mode), r = fn(tx.objectStore(store)); tx.oncomplete = () => { db.close(); res(r && r.result); }; tx.onerror = () => { db.close(); rej(tx.error); }; };
  });
}
async function dailyCheck(force, hour) {
  const st = await idb('kv', 'readonly', s => s.get('state')).catch(() => null);
  if (!st || !st.settings || !st.settings.notify) return;
  const now = new Date(), day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const last = await idb('kv', 'readonly', s => s.get('notify')).catch(() => null);
  if (!force && last && last.day === day) return;
  const lang = st.settings.lang || 'en', tt = (s, v) => mcT(lang, s, v);
  const items = mcDue(st, day, tt, hour ?? now.getHours());
  if (!items.length && !force) return;
  const biz = st.settings.biz || tt('My Shop');
  await self.registration.showNotification(items.length ? `${biz} · ${tt('{n} thing to check|{n} things to check', { n: items.length })}` : biz, {
    body: items.length ? items.map(i => '• ' + i.text).join('\n') : tt('All good'), tag: 'mc-daily', renotify: true,
    icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', lang, data: { to: items[0] ? items[0].to : '#/dash' }
  });
  if (!force) await idb('kv', 'readwrite', s => s.put({ day, n: items.length }, 'notify')).catch(() => { });
}
self.addEventListener('periodicsync', e => { if (e.tag === 'mc-daily') e.waitUntil(dailyCheck(false)); });
self.addEventListener('message', e => { if (e.data && e.data.type === 'mc-check') e.waitUntil(dailyCheck(!!e.data.force, e.data.hour)); });
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const to = './' + ((e.notification.data && e.notification.data.to) || '#/dash');
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    const w = ws[0];
    if (w) return w.focus().then(c => c && c.navigate ? c.navigate(to).catch(() => { }) : null);
    return self.clients.openWindow(to);
  }));
});
