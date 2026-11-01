import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { supabase, resetRedirect } from '../supabase.js'
import { MailCheck, Eye, EyeOff } from 'lucide-react'
import { Button, Field } from './ui.jsx'
import { friendlyAuthError } from '../lib/authErrors.js'
import Captcha, { CAPTCHA_SITE_KEY } from './Captcha.jsx'
import { reloadIfStale } from '../lib/freshness.js'
import { BrandMark } from './Loading.jsx'

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
  // The invite is tied to this address, so an invited person can't change it.
  const [inviteEmailLocked, setInviteEmailLocked] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
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
      if (inviteEmail) {
        setEmail(inviteEmail)
        setInviteEmailLocked(true)
      }
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

  const heading = {
    login: [t('login.welcomeTitle'), t('login.subtitle')],
    signup: [t('login.signupTitle'), t('login.subtitle')],
    reset: [t('login.resetTitle'), t('login.resetSubtitle')],
  }[mode]

  return (
    <div
      className="min-h-dvh flex flex-col px-5"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)',
      }}
    >
      <div className="w-full max-w-sm mx-auto flex items-center justify-between">
        <BrandMark />
        <div role="group" aria-label={t('layout.language')} className="flex p-[3px] rounded-[12px] bg-surface text-xs num">
          {[['en', 'EN'], ['he', 'עב']].map(([code, label]) => (
            <button
              key={code}
              type="button"
              onClick={() => setLang(code)}
              aria-pressed={lang === code}
              className={`min-w-[40px] min-h-[32px] rounded-[9px] font-medium transition-colors ${lang === code ? 'bg-[#2A2A2E] text-chalk' : 'text-chalkdim'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <main className="w-full max-w-sm mx-auto flex-1 flex flex-col justify-center gap-6 py-10">
        {mode === 'confirm' ? (
          <section className="flex flex-col gap-5">
            <span className="w-12 h-12 rounded-full bg-accentsoft text-accent flex items-center justify-center">
              <MailCheck size={22} strokeWidth={1.75} />
            </span>
            <div className="flex flex-col gap-2">
              <h1 className="text-[30px] leading-9">{t('login.confirmTitle')}</h1>
              <p className="text-chalkdim text-[15px]">
                {t('login.confirmBody')} {email && <bdi className="text-chalk">{email}</bdi>}
              </p>
            </div>
            <p className="text-chalkdim text-sm">{t('login.confirmHint')}</p>
            {error && <p className="text-irontext text-sm">{error}</p>}
            {resent ? (
              <p className="text-good text-sm">{t('login.confirmResent')}</p>
            ) : (
              <div className="flex flex-col gap-3">
                <Captcha ref={captcha} onToken={setCaptchaToken} />
                <Button type="button" variant="ghost" onClick={resend} disabled={busy || waitingForCaptcha || !email} className="w-full min-h-[48px]">
                  {busy ? t('login.oneMoment') : t('login.confirmResend')}
                </Button>
              </div>
            )}
            <TextLink onClick={() => switchMode('login')}>{t('login.backToLogin')}</TextLink>
          </section>
        ) : mode === 'reset' && resetSent ? (
          <section className="flex flex-col gap-5">
            <span className="w-12 h-12 rounded-full bg-accentsoft text-accent flex items-center justify-center">
              <MailCheck size={22} strokeWidth={1.75} />
            </span>
            <div className="flex flex-col gap-2">
              <h1 className="text-[30px] leading-9">{t('login.confirmTitle')}</h1>
              <p className="text-chalkdim text-[15px]">
                {t('login.resetSentTitle')} <bdi className="text-chalk">{email}</bdi>
              </p>
            </div>
            <TextLink onClick={() => switchMode('login')}>{t('login.backToLogin')}</TextLink>
          </section>
        ) : (
          <>
            <header className="flex flex-col gap-2">
              <h1 className="text-[30px] leading-9">{heading[0]}</h1>
              <p className="text-chalkdim text-[15px]">{heading[1]}</p>
            </header>

            {(mode === 'login' || mode === 'signup') && (
              <div role="tablist" className="grid grid-cols-2 gap-0.5 p-[3px] rounded-[12px] bg-surface">
                {[['login', t('login.logIn')], ['signup', t('login.createAccount')]].map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={mode === m}
                    onClick={() => switchMode(m)}
                    className={`min-h-[44px] rounded-[9px] text-sm font-medium transition-colors duration-200 ${mode === m ? 'bg-[#2A2A2E] text-chalk' : 'text-chalkdim'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {mode === 'signup' && invited && <p className="text-accent text-sm">{t('login.invitedNote')}</p>}
              {/* Sign-up is by invitation only; say so before the form is filled in, not after. */}
              {mode === 'signup' && !invited && <p className="text-chalkdim text-sm">{t('login.inviteOnlyNote')}</p>}

              {mode === 'signup' && (
                <Field label={t('login.name')}>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('login.namePlaceholder')}
                    autoComplete="name"
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
                  autoComplete="email"
                  readOnly={mode === 'signup' && inviteEmailLocked}
                  className={mode === 'signup' && inviteEmailLocked ? 'opacity-70' : undefined}
                  required
                />
              </Field>

              {mode !== 'reset' && (
                <Field label={t('login.password')}>
                  {/* Passwords are typed left to right in both languages, eye button included. */}
                  <div className="relative" dir="ltr">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      minLength={mode === 'signup' ? 8 : undefined}
                      className="w-full pe-12"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                      aria-pressed={showPassword}
                      className="absolute inset-y-0 end-0 w-11 flex items-center justify-center text-chalkdim hover:text-chalk"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {mode === 'signup' && <p className="text-chalkdim text-xs">{t('login.passwordHint')}</p>}
                </Field>
              )}

              {mode === 'login' && (
                <TextLink onClick={() => switchMode('reset')} className="-mt-1">{t('login.forgotPassword')}</TextLink>
              )}

              {notice && <p className="text-good text-sm">{notice}</p>}
              {error && <p className="text-irontext text-sm">{error}</p>}

              <Captcha ref={captcha} onToken={setCaptchaToken} />

              <Button type="submit" disabled={busy || waitingForCaptcha} className="mt-1 w-full min-h-[52px] text-base">
                {busy
                  ? t('login.oneMoment')
                  : mode === 'login'
                    ? t('login.logIn')
                    : mode === 'signup'
                      ? t('login.createAccount')
                      : t('login.sendResetLink')}
              </Button>

              {mode === 'reset' && <TextLink onClick={() => switchMode('login')}>{t('login.backToLogin')}</TextLink>}
            </form>
          </>
        )}
      </main>

      <footer className="w-full max-w-sm mx-auto flex flex-col items-center gap-1.5 text-chalkdim text-xs text-center">
        <p>{t('login.footerNote')}</p>
        <Link to="/privacy" className="hover:text-chalk">{t('privacy.link')}</Link>
      </footer>
    </div>
  )
}

// A quiet text action: "Forgot password?", "Back to log in".
function TextLink({ onClick, children, className = '' }) {
  return (
    <button type="button" onClick={onClick} className={`text-chalkdim text-sm hover:text-chalk w-fit ${className}`}>
      {children}
    </button>
  )
}
