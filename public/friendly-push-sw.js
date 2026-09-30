// No authorization or message contents are stored in the worker.
const stateCache = 'friendly-push-state-v1';
const stateUrl = new URL('/friendly-push/enabled', self.location.origin).href;
self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'friendly:enable') return;
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(stateCache);
        if (event.data.enabled) await cache.put(stateUrl, new Response('1'));
        else await cache.delete(stateUrl);
        event.ports[0]?.postMessage('ok');
      } catch {
        event.ports[0]?.postMessage('error');
      }
    })(),
  );
});
self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(stateCache);
      if (!(await cache.match(stateUrl))) return;
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      windows.forEach((client) => client.postMessage({ type: 'friendly:refresh' }));
      if (windows.some((client) => client.visibilityState === 'visible' && client.focused)) return;
      await self.registration.showNotification('New activity on Friendly', {
        body: 'Open the app to see replies and friend requests.',
        tag: 'friendly-activity',
        data: { path: '/activity' },
      });
    })(),
  );
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(new URL('/activity', self.location.origin).href));
});
