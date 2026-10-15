/* Service worker do Personal Control (PWA — Fase 9).
 * - Shell (navegação): rede com fallback para o cache offline.
 * * Assets: cache-first com revalidação em segundo plano.
 * - APIs (Supabase): sempre rede — dados ficam no Dexie/React Query.
 * - Push (Minhas Finanças): exibe o lembrete e abre a aba ao clicar. */

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  if (payload.type && payload.type !== 'mf-reminder') return;
  const title = payload.title || 'Minhas Finanças';
  const options = {
    body: payload.body || '',
    tag: payload.tag || 'mf-reminder',
    renotify: true,
    data: { url: payload.url || '/?tab=minhasfinancas-transactions' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windows) => {
        for (const win of windows) {
          if ('focus' in win) {
            try {
              win.navigate(url);
            } catch {
              /* versão antiga: só foca */
            }
            return win.focus();
          }
        }
        return self.clients.openWindow(url);
      })
  );
});

const CACHE = 'personalcontrol-shell-v1';
const SHELL = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/favicon-32x32.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // APIs externas (Supabase) e cross-origin: sempre rede.
  if (url.origin !== self.location.origin) return;

  // Navegação SPA: rede primeiro, shell do cache quando offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/'))
    );
    return;
  }

  // Assets: cache-first com atualização em segundo plano.
  event.respondWith(
    caches.match(request).then((cached) => {
      const refresh = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => cached);
      return cached || refresh;
    })
  );
});
