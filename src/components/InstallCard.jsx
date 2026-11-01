import React, { useEffect, useState } from 'react'
import { Download, Share, X } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext.jsx'

const KEY = 'ironlog:installDismissed'

// Chrome fires beforeinstallprompt once, early. main.jsx calls this at
// start-up so the event isn't missed when the card mounts later.
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

function standalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
}

function isIosSafari() {
  const ua = navigator.userAgent
  const ios = /iP(hone|ad|od)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  // Other iOS browsers (Chrome, Firefox, Edge) can't add to the home screen.
  return ios && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)
}

function readDismissed() {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}

// "Add to home screen" prompt. Shown on Android/Chrome when the browser
// offers an install, and as a hint on iPhone Safari; hidden once installed
// or dismissed.
export default function InstallCard() {
  const { t } = useLanguage()
  const [, bump] = useState(0)
  const [dismissed, setDismissed] = useState(readDismissed)

  useEffect(() => {
    const fn = () => bump((n) => n + 1)
    listeners.add(fn)
    return () => listeners.delete(fn)
  }, [])

  if (dismissed || standalone()) return null
  const ios = isIosSafari()
  if (!deferred && !ios) return null

  function dismiss() {
    setDismissed(true)
    try { localStorage.setItem(KEY, '1') } catch { /* private mode */ }
  }

  async function install() {
    const ev = deferred
    if (!ev) return
    deferred = null
    bump((n) => n + 1)
    ev.prompt()
    try {
      const { outcome } = await ev.userChoice
      if (outcome === 'dismissed') dismiss()
    } catch { /* ignore */ }
  }

  return (
    <div className="card p-4 flex items-start gap-3" role="region" aria-label={t('install.title')}>
      <div className="shrink-0 mt-0.5 text-irontext">{ios ? <Share size={20} /> : <Download size={20} />}</div>
      <div className="min-w-0 flex-1">
        <div className="text-chalk font-medium">{t('install.title')}</div>
        <p className="text-chalkdim text-sm mt-0.5">{ios ? t('install.iosHint') : t('install.body')}</p>
        {!ios && (
          <button type="button" onClick={install} className="press mt-3 rounded-full bg-accent text-ink font-semibold px-4 min-h-11 text-sm">
            {t('install.button')}
          </button>
        )}
      </div>
      <button type="button" onClick={dismiss} aria-label={t('install.dismiss')} className="press shrink-0 w-11 h-11 -mt-2 -me-2 rounded-full flex items-center justify-center text-chalkdim">
        <X size={18} />
      </button>
    </div>
  )
}
