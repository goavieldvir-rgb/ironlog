import React, { useEffect, useState } from 'react'
import { Copy, Check, ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { confirmedApps, startSetup, verifyCode } from '../lib/mfa.js'
import { Button, Field } from './ui.jsx'

function codeError(err, t) {
  const code = err?.code || ''
  if (code === 'mfa_verification_failed' || /invalid totp|expired/i.test(err?.message || '')) return t('twoStep.wrongCode')
  if (code === 'over_request_rate_limit' || /rate limit|too many/i.test(err?.message || '')) return t('login.errorRateLimit')
  return t('twoStep.genericError')
}

function CodeInput({ value, onChange }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="\d{6}"
      placeholder="123456"
      dir="ltr"
      className="num tracking-[0.3em] text-center text-lg"
      required
      autoFocus
    />
  )
}

// Full-screen wrapper for the two screens that stand between a password and
// the app, with a way out for someone who opened the wrong account.
function Gate({ title, children }) {
  const { user, logout } = useAuth()
  const { t } = useLanguage()
  return (
    <div className="min-h-dvh flex items-center justify-center px-4" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div className="w-full max-w-sm flex flex-col gap-5">
        <div>
          <div className="eyebrow mb-1">Ironlog</div>
          <h1 className="text-3xl">{title}</h1>
          {user?.email && <p className="text-sm text-chalkdim mt-1"><bdi>{user.email}</bdi></p>}
        </div>
        <div className="card p-6">{children}</div>
        <button type="button" onClick={logout} className="text-chalkdim text-xs hover:text-chalk w-fit mx-auto">
          {t('twoStep.signOut')}
        </button>
      </div>
    </div>
  )
}

// After the password: the code from the authenticator app.
export function TwoStepChallenge() {
  const { t } = useLanguage()
  const { refreshMfa } = useAuth()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const [app] = await confirmedApps()
      if (!app) return refreshMfa()
      await verifyCode(app.id, code)
      await refreshMfa()
    } catch (err) {
      setError(codeError(err, t))
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Gate title={t('twoStep.challengeTitle')}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-chalkdim text-sm">{t('twoStep.challengeBody')}</p>
        <Field label={t('twoStep.codeLabel')}>
          <CodeInput value={code} onChange={setCode} />
        </Field>
        {error && <p className="text-irontext text-sm">{error}</p>}
        <Button type="submit" disabled={busy || code.length !== 6} className="w-full">
          {busy ? t('login.oneMoment') : t('twoStep.verify')}
        </Button>
        <p className="text-chalkdim text-xs">{t('twoStep.lostPhone')}</p>
      </form>
    </Gate>
  )
}

// Scan the QR code, type the first code. Used inside Account, and on its own
// screen for the coach account, which can't be used without it.
export function TwoStepSetup({ onDone, onCancel }) {
  const { t } = useLanguage()
  const { refreshMfa } = useAuth()
  const [setup, setSetup] = useState(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let live = true
    startSetup()
      .then((s) => live && setSetup(s))
      .catch((err) => live && setError(codeError(err, t)))
    return () => {
      live = false
    }
  }, [])

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await verifyCode(setup.factorId, code)
      await refreshMfa()
      onDone?.()
    } catch (err) {
      setError(codeError(err, t))
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  async function copySecret() {
    await navigator.clipboard.writeText(setup.secret)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <ol className="text-chalkdim text-sm list-decimal ps-5 flex flex-col gap-1">
        <li>{t('twoStep.step1')}</li>
        <li>{t('twoStep.step2')}</li>
        <li>{t('twoStep.step3')}</li>
      </ol>
      {setup ? (
        <>
          <img src={setup.qr} alt={t('twoStep.qrAlt')} className="w-48 h-48 mx-auto rounded-md bg-white p-2" />
          <div className="flex items-center gap-2">
            <code dir="ltr" className="flex-1 min-w-0 break-all text-xs bg-surface2 rounded-md px-2 py-1.5 num">{setup.secret}</code>
            <Button type="button" variant="ghost" onClick={copySecret} aria-label={t('twoStep.copySecret')}>
              {copied ? <Check size={15} /> : <Copy size={15} />}
            </Button>
          </div>
          <Field label={t('twoStep.codeLabel')}>
            <CodeInput value={code} onChange={setCode} />
          </Field>
        </>
      ) : (
        !error && <p className="text-chalkdim text-sm">{t('login.oneMoment')}</p>
      )}
      {error && <p className="text-irontext text-sm">{error}</p>}
      <div className="flex gap-2 justify-end">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        )}
        <Button type="submit" disabled={!setup || busy || code.length !== 6}>
          <ShieldCheck size={16} /> {busy ? t('login.oneMoment') : t('twoStep.turnOn')}
        </Button>
      </div>
    </form>
  )
}

// The coach account has to have two-step on before it can open anything.
export function TwoStepRequired() {
  const { t } = useLanguage()
  return (
    <Gate title={t('twoStep.requiredTitle')}>
      <p className="text-chalkdim text-sm mb-4">{t('twoStep.requiredBody')}</p>
      <TwoStepSetup />
    </Gate>
  )
}
