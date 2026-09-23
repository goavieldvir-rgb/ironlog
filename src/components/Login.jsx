import React, { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { supabase } from '../supabase.js'
import { Button, Field } from './ui.jsx'

export default function Login({ resetLinkError }) {
  const { login, signup } = useAuth()
  const { t, lang, setLang } = useLanguage()
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [invited, setInvited] = useState(false)

  useEffect(() => {
    if (resetLinkError) {
      setMode('reset')
      setError(resetLinkError)
    }
  }, [resetLinkError])

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
    setBusy(true)
    try {
      if (mode === 'login') {
        await login(email, password)
      } else if (mode === 'signup') {
        await signup(email, password, name)
      } else if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + window.location.pathname,
        })
        if (error) throw error
        setResetSent(true)
      }
    } catch (err) {
      setError(friendlyError(err, t))
    } finally {
      setBusy(false)
    }
  }

  function switchMode(next) {
    setMode(next)
    setError('')
    setResetSent(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative">
      <button
        onClick={() => setLang(lang === 'en' ? 'he' : 'en')}
        className="absolute top-4 end-4 flex rounded-md bg-surface2 p-0.5 text-xs num"
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
          {mode !== 'reset' && (
            <div className="flex mb-6 rounded-md bg-surface2 p-1 text-sm">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className={`flex-1 rounded py-1.5 transition-colors ${mode === 'login' ? 'bg-ink text-chalk' : 'text-chalkdim'}`}
              >
                {t('login.logIn')}
              </button>
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className={`flex-1 rounded py-1.5 transition-colors ${mode === 'signup' ? 'bg-ink text-chalk' : 'text-chalkdim'}`}
              >
                {t('login.createAccount')}
              </button>
            </div>
          )}

          {mode === 'reset' && resetSent ? (
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
                    minLength={6}
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

              {error && <p className="text-iron text-sm">{error}</p>}

              <Button type="submit" disabled={busy} className="mt-2 w-full">
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
      </div>
    </div>
  )
}

function friendlyError(err, t) {
  const msg = err?.message || ''
  if (msg.includes('Invalid login credentials')) return t('login.errorBadCredentials')
  if (msg.includes('User already registered')) return t('login.errorAlreadyRegistered')
  if (msg.includes('Password should be')) return t('login.errorWeakPassword')
  if (msg.includes('Unable to validate email')) return t('login.errorBadEmail')
  return msg || t('login.errorGeneric')
}
