import { useEffect, useState } from 'react'

// Chrome fires beforeinstallprompt once, early. main.jsx calls this at
// start-up so the event isn't missed when the install guide mounts later.
let deferred = null
const listeners = new Set()
export function captureInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e
    listeners.forEach((fn) => fn())
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    listeners.forEach((fn) => fn())
  })
}

export function standalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
}

export function isIos() {
  const ua = navigator.userAgent
  return /iP(hone|ad|od)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

// Re-renders when Chrome offers (or withdraws) its install prompt, and
// returns a function that shows it, or null when there is none to show.
export function useInstallPrompt(onDismissed) {
  const [, bump] = useState(0)
  useEffect(() => {
    const fn = () => bump((n) => n + 1)
    listeners.add(fn)
    return () => listeners.delete(fn)
  }, [])
  if (!deferred) return null
  return async () => {
    const ev = deferred
    if (!ev) return
    deferred = null
    listeners.forEach((fn) => fn())
    ev.prompt()
    try {
      const { outcome } = await ev.userChoice
      if (outcome === 'dismissed') onDismissed?.()
    } catch { /* ignore */ }
  }
}
