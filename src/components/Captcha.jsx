import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext.jsx'

// Cloudflare Turnstile: proves a real person is signing in, signing up or
// asking for an email, so bots can't hammer those forms. Supabase checks the
// token when "Enable Captcha protection" is on (Authentication -> Attack
// Protection). Without a site key in the build this renders nothing and the
// forms work as before.
export const CAPTCHA_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || ''

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let loading = null

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = SCRIPT
      s.async = true
      s.onload = () => resolve(window.turnstile)
      s.onerror = () => {
        loading = null
        s.remove()
        reject(new Error('captcha failed to load'))
      }
      document.head.appendChild(s)
    })
  }
  return loading
}

// Calls onToken with a one-time token, or '' when it expires or fails. A
// token works once, so the form calls ref.reset() after every attempt.
// Most people never see Cloudflare's box; this shows our own line while the
// check runs, and a way to retry if it can't load.
const Captcha = forwardRef(function Captcha({ onToken }, ref) {
  const { t, lang } = useLanguage()
  const box = useRef(null)
  const widget = useRef(null)
  const [status, setStatus] = useState('checking') // checking | done | failed
  const [attempt, setAttempt] = useState(0)

  useImperativeHandle(ref, () => ({
    reset() {
      onToken('')
      setStatus('checking')
      if (widget.current != null) window.turnstile?.reset(widget.current)
    },
  }))

  useEffect(() => {
    if (!CAPTCHA_SITE_KEY) return
    let live = true
    setStatus('checking')
    // A check that never finishes (a blocked script, a flaky connection)
    // shouldn't leave the button waiting forever.
    const slow = setTimeout(() => live && setStatus((s) => (s === 'checking' ? 'failed' : s)), 20000)
    loadTurnstile()
      .then((ts) => {
        if (!live || !box.current) return
        widget.current = ts.render(box.current, {
          sitekey: CAPTCHA_SITE_KEY,
          language: lang,
          theme: 'dark',
          size: 'flexible',
          // Only shows a checkbox when Cloudflare isn't sure; most people see nothing.
          appearance: 'interaction-only',
          callback: (token) => {
            setStatus('done')
            onToken(token)
          },
          'expired-callback': () => {
            onToken('')
            setStatus('checking')
            window.turnstile?.reset(widget.current)
          },
          'error-callback': () => {
            onToken('')
            setStatus('failed')
          },
        })
      })
      .catch(() => live && setStatus('failed'))
    return () => {
      live = false
      clearTimeout(slow)
      if (widget.current != null) window.turnstile?.remove(widget.current)
      widget.current = null
    }
  }, [lang, attempt])

  if (!CAPTCHA_SITE_KEY) return null
  return (
    <div className="flex flex-col gap-2">
      <div ref={box} className="empty:hidden" />
      {status === 'checking' && (
        <p className="flex items-center gap-1.5 text-chalkdim text-xs">
          <ShieldCheck size={14} className="animate-pulse" /> {t('login.checking')}
        </p>
      )}
      {status === 'failed' && (
        <div className="flex flex-col items-start gap-1">
          <p className="text-irontext text-xs">{t('login.captchaFailed')}</p>
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="text-accent text-xs font-medium hover:text-chalk">
            {t('login.captchaRetry')}
          </button>
        </div>
      )}
    </div>
  )
})

export default Captcha
