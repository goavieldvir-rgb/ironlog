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
      // The small white dumbbell Android shows in the status bar.
      badge: './notification-badge.png',
      tag: data.tag || 'ironlog-reminder',
      // "Rest over" replaces the rest timer's quiet lock screen card, and
      // must still sound and vibrate when it does.
      renotify: data.tag === 'ironlog-rest-timer',
      lang: data.lang,
      dir: data.lang === 'he' ? 'rtl' : 'ltr',
      // A screen inside the app to open on tap, such as '#/history/<id>'.
      data: { url: typeof data.url === 'string' && data.url.startsWith('#/') ? data.url : '' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const scope = self.registration.scope
  const target = scope + (event.notification.data?.url || '')
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      // Only a tab inside this app's own folder: every GitHub Pages project
      // on this account shares one origin.
      const open = list.find((c) => c.url.startsWith(scope))
      if (open) {
        if (target === scope) return open.focus()
        return open.focus().then((c) => (c || open).navigate(target)).catch(() => self.clients.openWindow(target))
      }
      return self.clients.openWindow(target)
    }),
  )
})
