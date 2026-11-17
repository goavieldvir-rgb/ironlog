// Notices when a newer version of the app has been deployed.
//
// Every build writes version.json with its own id, and the same id is baked
// into the code. An app that was opened before a deploy (or was served the
// saved copy on a slow connection) keeps running the old code until it is
// reloaded, so it asks the server for version.json now and then and, if the
// id differs, offers an update.

/* global __BUILD_ID__ */
const BUILD_ID = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : ''
const BASE = import.meta.env.BASE_URL

export async function newerVersionLive() {
  if (!import.meta.env.PROD || !BUILD_ID) return false
  try {
    const res = await fetch(`${BASE}version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return false
    const { id } = await res.json()
    return typeof id === 'string' && id !== BUILD_ID
  } catch {
    return false // offline or a blip: try again next time
  }
}

// Also lets the browser check for a changed service worker file.
export function checkWorkerUpdate() {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.getRegistration().then((reg) => reg?.update()).catch(() => {})
}

// Fetches the new page fresh into the worker's saved copy before reloading,
// so the reload shows the new version even if the network is slow then.
export async function reloadToNewVersion() {
  try {
    const scope = new URL(BASE, window.location.href).href
    const res = await fetch(scope, { cache: 'reload' })
    if (res.ok && 'caches' in window) {
      const cache = await caches.open('ironlog-shell-v1')
      await cache.put(scope, res)
    }
  } catch {
    // still reload: the page itself asks the network first
  }
  window.location.reload()
}
