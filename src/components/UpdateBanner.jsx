import React, { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext.jsx'
import { checkWorkerUpdate, newerVersionLive, reloadToNewVersion } from '../lib/appVersion.js'

const CHECK_EVERY_MS = 10 * 60 * 1000

// A small pill that appears when a newer version of the app is live. It never
// reloads by itself, so nobody loses a workout in progress: they tap when ready.
export default function UpdateBanner() {
  const { t } = useLanguage()
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!import.meta.env.PROD) return
    let stopped = false
    const check = () => {
      if (stopped || document.visibilityState !== 'visible') return
      checkWorkerUpdate()
      newerVersionLive().then((newer) => { if (newer && !stopped) setReady(true) })
    }
    const first = setTimeout(check, 5000)
    const timer = setInterval(check, CHECK_EVERY_MS)
    document.addEventListener('visibilitychange', check)
    return () => {
      stopped = true
      clearTimeout(first)
      clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])

  if (!ready) return null
  return (
    <div
      className="fixed inset-x-0 z-50 flex justify-center px-4 pointer-events-none"
      style={{ bottom: 'calc(5.5rem + env(safe-area-inset-bottom, 0px))' }}
      role="status"
      aria-live="polite"
    >
      <button
        type="button"
        disabled={busy}
        onClick={() => { setBusy(true); reloadToNewVersion() }}
        className="pointer-events-auto flex items-center gap-2.5 rounded-full bg-[#232326] text-chalk ps-3 pe-4 py-2.5 text-[15px] font-semibold max-w-sm shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
      >
        <RefreshCw size={16} strokeWidth={2.5} className={busy ? 'animate-spin motion-reduce:animate-none' : ''} />
        <span>{t('feedback.updateReady')}</span>
        <span className="text-accent">{t('feedback.updateNow')}</span>
      </button>
    </div>
  )
}
