// Notifications push : ajouté au service worker de l'appli (workbox importScripts).
// Affiche la notification même appli fermée / téléphone verrouillé, puis ouvre le bon
// écran au toucher. Contenu envoyé par l'Edge Function push-send : { title, body, link, tag }.

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'RTS Atelier';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      vibrate: [200, 100, 200, 100, 200],
      data: { link: data.link || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = new URL((event.notification.data && event.notification.data.link) || '/', self.location.origin)
    .href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      // Appli déjà ouverte : on l'amène au premier plan sur le bon écran.
      for (const client of windows) {
        if ('focus' in client) {
          return client.focus().then((focused) => ('navigate' in focused ? focused.navigate(link) : focused));
        }
      }
      return self.clients.openWindow(link);
    }),
  );
});
