import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

// Cloudflare Turnstile: proves a real person is signing in, signing up or
// asking for a reset link, so bots can't hammer those forms. Supabase checks
// the token when "Enable Captcha protection" is on (Authentication -> Attack
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
        reject(new Error('captcha failed to load'))
      }
      document.head.appendChild(s)
    })
  }
  return loading
}

// Calls onToken with a one-time token, or '' when it expires or fails. A
// token works once, so the form calls ref.reset() after every attempt.
const Captcha = forwardRef(function Captcha({ onToken, lang }, ref) {
  const box = useRef(null)
  const widget = useRef(null)

  useImperativeHandle(ref, () => ({
    reset() {
      onToken('')
      if (widget.current != null) window.turnstile?.reset(widget.current)
    },
  }))

  useEffect(() => {
    if (!CAPTCHA_SITE_KEY) return
    let live = true
    loadTurnstile()
      .then((ts) => {
        if (!live || !box.current) return
        widget.current = ts.render(box.current, {
          sitekey: CAPTCHA_SITE_KEY,
          language: lang,
          // Only shows a checkbox when Cloudflare isn't sure; most people see nothing.
          appearance: 'interaction-only',
          callback: (token) => onToken(token),
          'expired-callback': () => onToken(''),
          'error-callback': () => onToken(''),
        })
      })
      .catch((err) => console.error(err))
    return () => {
      live = false
      if (widget.current != null) window.turnstile?.remove(widget.current)
      widget.current = null
    }
  }, [lang])

  if (!CAPTCHA_SITE_KEY) return null
  return <div ref={box} className="flex justify-center empty:hidden" />
})

export default Captcha
