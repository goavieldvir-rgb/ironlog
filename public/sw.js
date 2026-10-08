// Push-only service worker. It deliberately has no fetch handler and no
// cache, so the app is always loaded fresh from the network and new
// deployments show up as soon as the app is reopened.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { /* ignore bad payload */ }
  const title = data.title || 'Ironlog'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: './apple-touch-icon.png',
      tag: data.tag || 'ironlog-reminder',
      lang: data.lang,
      dir: data.lang === 'he' ? 'rtl' : 'ltr',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = self.registration.scope
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list[0]
      if (open) return open.focus()
      return self.clients.openWindow(target)
    }),
  )
})
