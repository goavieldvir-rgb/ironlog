import { useEffect } from 'react'

// Keeps the screen on while `active`, so the phone doesn't lock between sets.
// The browser drops the lock whenever the page is hidden, so it is asked for
// again each time the page comes back. Browsers without the API just skip it.
export function useWakeLock(active) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let lock = null
    let cancelled = false

    async function request() {
      if (cancelled || document.visibilityState !== 'visible' || lock) return
      try {
        lock = await navigator.wakeLock.request('screen')
        lock.addEventListener('release', () => {
          lock = null
        })
        if (cancelled) lock.release().catch(() => {})
      } catch {
        // Denied (low battery, no user gesture yet): the screen just sleeps as usual.
      }
    }

    request()
    document.addEventListener('visibilitychange', request)
    // Some browsers refuse the first request until the person has tapped once.
    document.addEventListener('pointerdown', request, { once: true })
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', request)
      document.removeEventListener('pointerdown', request)
      lock?.release().catch(() => {})
    }
  }, [active])
}
