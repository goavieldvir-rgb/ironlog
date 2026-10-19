import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { supabase, resetRedirect } from '../supabase.js'
import { MailCheck } from 'lucide-react'
import { Button, Field } from './ui.jsx'
import { friendlyAuthError } from '../lib/authErrors.js'
import Captcha, { CAPTCHA_SITE_KEY } from './Captcha.jsx'
import { reloadIfStale } from '../lib/freshness.js'

export default function Login({ linkProblem }) {
  const { login, signup, resendConfirmation } = useAuth()
  const { t, lang, setLang } = useLanguage()
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  // A good-news line, such as "your email is confirmed".
  const [notice, setNotice] = useState('')
  const [resent, setResent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [invited, setInvited] = useState(false)
  const [captchaToken, setCaptchaToken] = useState('')
  const captcha = useRef(null)

  // Opened from an email link that couldn't sign them in.
  useEffect(() => {
    if (!linkProblem) return
    if (linkProblem.kind === 'signup') {
      setMode('login')
      // Supabase confirms the email before handing over the code, so a code
      // this browser can't use (the link opened on another device) still
      // means a confirmed email.
      if (linkProblem.expired) setError(t('login.confirmLinkExpired'))
      else setNotice(t('login.emailConfirmed'))
    } else {
      setMode('reset')
      setError(t('login.resetLinkInvalid'))
    }
  }, [linkProblem])

  // An installed app left open for days may be an older copy than the one
  // live now, missing steps the server requires.
  useEffect(() => {
    reloadIfStale()
    const onShow = () => document.visibilityState === 'visible' && reloadIfStale()
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, [])

  // A link generated from People → "Invite someone" pre-fills the sign-up
  // form so whoever opens it just needs to pick a password.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const inviteEmail = params.get('invite_email')
    const inviteName = params.get('invite_name')
    if (inviteEmail || inviteName) {
      setMode('signup')
      setInvited(true)
      if (inviteEmail) setEmail(inviteEmail)
      if (inviteName) setName(inviteName)
    }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    try {
      if (mode === 'login') {
        await login(email, password, captchaToken)
      } else if (mode === 'signup') {
        if (await signup(email, password, name, captchaToken)) setMode('confirm')
      } else if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: resetRedirect(),
          captchaToken,
        })
        if (error) throw error
        setResetSent(true)
      }
    } catch (err) {
      if (err?.code === 'email_not_confirmed' || /email not confirmed/i.test(err?.message || '')) {
        setMode('confirm')
      } else {
        // Rejected for a missing captcha: this copy of the app may be out of date.
        if (err?.code === 'captcha_failed') reloadIfStale()
        setError(friendlyAuthError(err, t))
      }
    } finally {
      // A captcha token works once.
      captcha.current?.reset()
      setBusy(false)
    }
  }

  function switchMode(next) {
    setMode(next)
    setError('')
    setNotice('')
    setResetSent(false)
    setResent(false)
  }

  async function resend() {
    setError('')
    setBusy(true)
    try {
      await resendConfirmation(email, captchaToken)
      setResent(true)
    } catch (err) {
      setError(friendlyAuthError(err, t))
    } finally {
      captcha.current?.reset()
      setBusy(false)
    }
  }

  const waitingForCaptcha = !!CAPTCHA_SITE_KEY && !captchaToken

  return (
    <div
      className="min-h-dvh flex items-center justify-center px-4 relative"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <button
        onClick={() => setLang(lang === 'en' ? 'he' : 'en')}
        className="hit absolute end-4 flex rounded-md bg-surface2 p-0.5 text-xs num"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}
        title={t('layout.language')} aria-label={t('layout.language')}
      >
        <span className={`px-2 py-1 rounded ${lang === 'en' ? 'bg-ink text-chalk' : 'text-chalkdim'}`}>EN</span>
        <span className={`px-2 py-1 rounded ${lang === 'he' ? 'bg-ink text-chalk' : 'text-chalkdim'}`}>עב</span>
      </button>

      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="eyebrow mb-2">Ironlog</div>
          <h1 className="text-4xl tracking-wide">{t('login.tagline')}</h1>
          <p className="text-chalkdim text-sm mt-2">{t('login.subtitle')}</p>
        </div>

        <div className="card p-6">
          {(mode === 'login' || mode === 'signup') && (
            <div className="flex mb-6 rounded-md bg-surface2 p-1 text-sm">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className={`flex-1 rounded min-h-11 transition-colors ${mode === 'login' ? 'bg-ink text-chalk' : 'text-chalkdim'}`}
              >
                {t('login.logIn')}
              </button>
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className={`flex-1 rounded min-h-11 transition-colors ${mode === 'signup' ? 'bg-ink text-chalk' : 'text-chalkdim'}`}
              >
                {t('login.createAccount')}
              </button>
            </div>
          )}

          {mode === 'confirm' ? (
            <div className="flex flex-col gap-4 text-center py-2">
              <MailCheck size={36} className="text-brass mx-auto" />
              <h2 className="text-xl">{t('login.confirmTitle')}</h2>
              <p className="text-chalkdim text-sm">{t('login.confirmBody')}</p>
              {email && <p className="text-chalk text-sm"><bdi>{email}</bdi></p>}
              <p className="text-chalkdim text-xs">{t('login.confirmHint')}</p>
              {error && <p className="text-irontext text-sm">{error}</p>}
              {resent ? (
                <p className="text-good text-sm">{t('login.confirmResent')}</p>
              ) : (
                <>
                  <Captcha ref={captcha} onToken={setCaptchaToken} />
                  <Button type="button" variant="ghost" onClick={resend} disabled={busy || waitingForCaptcha || !email}>
                    {busy ? t('login.oneMoment') : t('login.confirmResend')}
                  </Button>
                </>
              )}
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="text-brass text-sm hover:underline w-fit mx-auto"
              >
                {t('login.backToLogin')}
              </button>
            </div>
          ) : mode === 'reset' && resetSent ? (
            <div className="flex flex-col gap-4 text-center py-2">
              <p className="text-chalk">{t('login.resetSentTitle')}</p>
              <p className="text-chalkdim text-sm">
                {t('login.resetSentTo')} {email}
              </p>
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="text-brass text-sm hover:underline w-fit mx-auto"
              >
                {t('login.backToLogin')}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {mode === 'reset' && (
                <div>
                  <h2 className="text-xl mb-1">{t('login.resetTitle')}</h2>
                  <p className="text-chalkdim text-sm">{t('login.resetSubtitle')}</p>
                </div>
              )}

              {mode === 'signup' && invited && (
                <p className="text-brass text-sm -mt-2">{t('login.invitedNote')}</p>
              )}

              {mode === 'signup' && (
                <Field label={t('login.name')}>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('login.namePlaceholder')}
                    required
                  />
                </Field>
              )}

              <Field label={t('login.email')}>
                <input
                  type="email"
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </Field>

              {mode !== 'reset' && (
                <Field label={t('login.password')}>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    minLength={mode === 'signup' ? 8 : undefined}
                    required
                  />
                </Field>
              )}

              {mode === 'login' && (
                <button
                  type="button"
                  onClick={() => switchMode('reset')}
                  className="text-chalkdim text-xs hover:text-brass w-fit -mt-1"
                >
                  {t('login.forgotPassword')}
                </button>
              )}

              {notice && <p className="text-good text-sm">{notice}</p>}
              {error && <p className="text-irontext text-sm">{error}</p>}

              <Captcha ref={captcha} onToken={setCaptchaToken} />

              <Button type="submit" disabled={busy || waitingForCaptcha} className="mt-2 w-full">
                {busy
                  ? t('login.oneMoment')
                  : mode === 'login'
                    ? t('login.logIn')
                    : mode === 'signup'
                      ? t('login.createAccount')
                      : t('login.sendResetLink')}
              </Button>

              {mode === 'reset' && (
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="text-chalkdim text-xs hover:text-chalk w-fit mx-auto"
                >
                  {t('login.backToLogin')}
                </button>
              )}
            </form>
          )}
        </div>

        <p className="text-chalkdim text-xs text-center mt-6">{t('login.footerNote')}</p>
        <Link to="/privacy" className="block text-chalkdim text-xs hover:text-brass text-center mt-2">
          {t('privacy.link')}
        </Link>
      </div>
    </div>
  )
}
