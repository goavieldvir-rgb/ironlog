// Service worker: push notifications plus a small offline shell.
//
// Caching rules, kept deliberately narrow so a new deploy always shows up:
//  - Pages (index.html): network first with a short timeout, the cached copy
//    only when the network is slow or gone. Never cache first.
//  - /assets/ (Vite's hashed files) and /fonts/: cache first, they never change
//    under the same name.
//  - /clips/ (exercise stills and clips): cache first, in their own cache so
//    a gym with no signal still plays them. Every link carries ?v=<hash of
//    the file>, so a re-rendered clip is a new address; the old version of
//    that file is dropped when the new one is stored. Videos are stored
//    whole and Range requests (Safari asks for byte ranges) are answered
//    from the stored copy.
//  - Everything else (Supabase, Google Fonts, any other origin, any non-GET)
//    is left to the browser untouched.
const CACHE = 'ironlog-shell-v1'
const CLIPS = 'ironlog-clips-v1'
const NAV_TIMEOUT_MS = 3000
const SCOPE = self.registration.scope // ends with '/', the app's own folder
const SCOPE_PATH = new URL(SCOPE).pathname

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      // One missing file must not stop the worker installing (push needs it).
      .then((c) => Promise.all(['', 'index.html', 'manifest.webmanifest', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'notification-badge.png']
        .map((f) => c.add(new Request(SCOPE + f, { cache: 'reload' })).catch(() => {}))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('ironlog-') && k !== CACHE && k !== CLIPS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  ),
)

function pageResponse(request, event) {
  const key = SCOPE // every navigation is the same single-page shell
  const network = fetch(request)
  // Registered now, while the event is still open: calling waitUntil later,
  // after the timeout has already answered from cache, throws and the cache
  // would never refresh. The copy is taken before the page reads the body.
  event.waitUntil(
    network
      .then((res) => {
        if (!res.ok) return
        const copy = res.clone()
        return caches.open(CACHE).then((c) => c.put(key, copy))
      })
      .catch(() => {}),
  )
  const fallback = () => caches.match(key).then((hit) => hit || caches.match(SCOPE + 'index.html'))
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NAV_TIMEOUT_MS))
  // A slow network or an error page falls back to the cached shell while the
  // fetch finishes in the background and refreshes the cache for next time.
  return Promise.race([network.catch(() => null), timeout]).then((res) => {
    if (res && res.ok) return res
    return fallback().then((hit) => hit || res || network)
  })
}

function assetResponse(request, event) {
  return caches.match(request).then((hit) => {
    if (hit) return hit
    return fetch(request).then((res) => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone()
        event.waitUntil(caches.open(CACHE).then((c) => c.put(request, copy)))
      }
      return res
    })
  })
}

// Part of a stored response, for a "Range: bytes=start-end" request.
async function rangeResponse(res, range) {
  const buf = await res.arrayBuffer()
  const size = buf.byteLength
  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
  if (!m || (m[1] === '' && m[2] === '')) return new Response(buf, { status: 200, headers: res.headers })
  let start, end
  if (m[1] === '') {
    // "bytes=-500": the last 500 bytes.
    start = Math.max(0, size - Number(m[2]))
    end = size - 1
  } else {
    start = Number(m[1])
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1)
  }
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
  }
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'video/mp4',
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  })
}

function clipResponse(request, event) {
  const url = new URL(request.url)
  const key = url.origin + url.pathname + url.search
  const range = request.headers.get('range')
  return caches
    .open(CLIPS)
    .then(async (c) => {
      let res = await c.match(key)
      if (!res) {
        // The whole file, even when the player asked for a range.
        const full = await fetch(key, { credentials: 'same-origin' })
        if (!full.ok || full.status !== 200) return range ? fetch(request) : full
        const copy = full.clone()
        event.waitUntil(
          c
            .put(key, copy)
            .then(() => c.keys())
            .then((keys) =>
              Promise.all(
                keys
                  .filter((k) => {
                    const u = new URL(k.url)
                    return u.pathname === url.pathname && u.search !== url.search
                  })
                  .map((k) => c.delete(k)),
              ),
            )
            .catch(() => {}),
        )
        res = full
      }
      return range ? rangeResponse(res, range) : res
    })
    .catch(() => fetch(request))
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (request.mode === 'navigate') {
    if (!url.pathname.startsWith(SCOPE_PATH)) return
    event.respondWith(pageResponse(request, event))
    return
  }
  if (url.pathname.startsWith(SCOPE_PATH + 'clips/')) {
    event.respondWith(clipResponse(request, event))
    return
  }
  if (url.pathname.startsWith(SCOPE_PATH + 'assets/') || url.pathname.startsWith(SCOPE_PATH + 'fonts/')) {
    event.respondWith(assetResponse(request, event))
  }
})

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { /* ignore bad payload */ }
  const title = data.title || 'Ironlog'
  const isMessage = typeof data.tag === 'string' && data.tag.startsWith('ironlog-msg-')
  const jobs = []
  // The unread count on the app icon, where the phone supports it (iPhone
  // Home Screen apps, Android and desktop Chrome).
  if (isMessage && typeof data.count === 'number' && self.navigator.setAppBadge) {
    jobs.push((data.count > 0 ? self.navigator.setAppBadge(data.count) : self.navigator.clearAppBadge()).catch(() => {}))
  }
  // An open app refreshes its unread badges right away.
  if (isMessage) {
    jobs.push(self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((list) => list.forEach((c) => c.postMessage({ type: 'ironlog-message' }))).catch(() => {}))
  }
  jobs.push(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: './apple-touch-icon.png',
      // The small white dumbbell Android shows in the status bar.
      badge: './notification-badge.png',
      tag: data.tag || 'ironlog-reminder',
      // "Rest over" replaces the rest timer's quiet lock screen card, and
      // must still sound and vibrate when it does.
      // A new message in a thread that already has a card still buzzes.
      renotify: data.tag === 'ironlog-rest-timer' || isMessage,
      lang: data.lang,
      dir: data.lang === 'he' ? 'rtl' : 'ltr',
      // A screen inside the app to open on tap, such as '#/history/<id>'.
      data: { url: typeof data.url === 'string' && data.url.startsWith('#/') ? data.url : '' },
    }),
  )
  event.waitUntil(Promise.all(jobs))
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
