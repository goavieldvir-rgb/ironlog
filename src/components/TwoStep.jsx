import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Copy, Check, ShieldCheck, Download } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage, LanguageProvider } from '../context/LanguageContext.jsx'
import { confirmedApps, startSetup, verifyCode, makeRecoveryCodes, recoveryCodesLeft, spendRecoveryCode } from '../lib/mfa.js'
import { useFeedback } from '../context/FeedbackContext.jsx'
import { Button, Field } from './ui.jsx'
import { BrandMark } from './Loading.jsx'

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

function RecoveryCodesSheet({ codes, onDone }) {
  const { t } = useLanguage()
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const text = codes.join('\n')

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setCopyFailed(false)
      setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      console.error(err)
      setCopyFailed(true)
    }
  }

  function download() {
    const blob = new Blob([`${t('twoStep.recFileHeader')}\n\n${text}\n`], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'ironlog-recovery-codes.txt'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rec-title"
      className="fixed inset-0 z-[100] bg-ink overflow-y-auto px-5"
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 24px)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}
    >
      <div className="w-full max-w-sm mx-auto flex flex-col gap-4">
        <h1 id="rec-title" className="text-[26px] leading-8 flex items-center gap-2"><ShieldCheck size={24} /> {t('twoStep.recSaveTitle')}</h1>
        <p role="alert" className="text-irontext text-sm font-semibold">{t('twoStep.recSaveWarn')}</p>
        <ul dir="ltr" className="grid grid-cols-2 gap-2 list-none p-0 m-0">
          {codes.map((c) => (
            <li key={c} className="num font-mono text-[15px] bg-surface2 rounded-md px-2 py-2 text-center select-all">{c}</li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={copy} className="flex-1">
            {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? t('twoStep.recCopied') : t('twoStep.recCopy')}
          </Button>
          <Button type="button" variant="ghost" onClick={download} className="flex-1">
            <Download size={16} /> {t('twoStep.recDownload')}
          </Button>
        </div>
        {copyFailed && <p className="text-chalkdim text-xs">{t('people.copyFailed')}</p>}
        <Button type="button" onClick={onDone} className="w-full">{t('twoStep.recDone')}</Button>
      </div>
    </div>
  )
}

// Shows the codes on top of whatever is on screen, in a root of its own. The
// coach's setup screen is replaced by the app the moment the code is verified,
// which would take an in-place screen away before anyone saved the codes.
// Resolves once the person says they saved them.
export function showRecoveryCodes(codes) {
  return new Promise((resolve) => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const close = () => {
      root.unmount()
      host.remove()
      resolve()
    }
    root.render(
      <LanguageProvider>
        <RecoveryCodesSheet codes={codes} onDone={close} />
      </LanguageProvider>,
    )
  })
}

// Makes new codes and shows them. Returns false when it couldn't (or the
// database has no recovery codes yet), so the caller can say so or stay quiet.
export async function makeAndShowRecoveryCodes() {
  const codes = await makeRecoveryCodes()
  if (!codes?.length) return false
  await showRecoveryCodes(codes)
  return true
}

// Full-screen wrapper for the two screens that stand between a password and
// the app, with a way out for someone who opened the wrong account.
function Gate({ title, children }) {
  const { user, logout } = useAuth()
  const { t } = useLanguage()
  return (
    <div
      className="min-h-dvh flex flex-col px-5"
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}
    >
      <div className="w-full max-w-sm mx-auto flex items-center justify-between">
        <BrandMark />
        <button type="button" onClick={logout} className="text-chalkdim text-sm hover:text-chalk min-h-[44px]">
          {t('twoStep.signOut')}
        </button>
      </div>
      <main className="w-full max-w-sm mx-auto flex-1 flex flex-col justify-center gap-6 py-10">
        <header className="flex flex-col gap-2">
          <h1 className="text-[30px] leading-9">{title}</h1>
          {user?.email && <p className="text-chalkdim text-[15px]"><bdi>{user.email}</bdi></p>}
        </header>
        {children}
      </main>
    </div>
  )
}

// After the password: the code from the authenticator app.
export function TwoStepChallenge() {
  const { t } = useLanguage()
  const { refreshMfa } = useAuth()
  const { toast } = useFeedback()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // Recovery codes: null until known, and hidden when the database doesn't
  // have them yet or this person has none.
  const [codesLeft, setCodesLeft] = useState(null)
  const [recovering, setRecovering] = useState(false)
  const [recCode, setRecCode] = useState('')

  useEffect(() => {
    let live = true
    recoveryCodesLeft().then((n) => live && setCodesLeft(n)).catch(() => {})
    return () => {
      live = false
    }
  }, [])

  async function submitRecovery(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (await spendRecoveryCode(recCode)) {
        // Say why the next screen asks for a new app (always, for the coach).
        toast(t('twoStep.recUsedToast'))
        await refreshMfa()
        return
      }
      setError(t('twoStep.recWrong'))
      setRecCode('')
    } catch (err) {
      setError(err?.tooMany ? t('twoStep.recTooMany') : t('twoStep.genericError'))
    } finally {
      setBusy(false)
    }
  }

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

  if (recovering) {
    return (
      <Gate title={t('twoStep.recLostLink')}>
        <form onSubmit={submitRecovery} className="flex flex-col gap-4">
          <p className="text-chalkdim text-sm">{t('twoStep.recEnterBody')}</p>
          <Field label={t('twoStep.recInputLabel')}>
            <input
              value={recCode}
              onChange={(e) => {
                const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)
                setRecCode(v.length > 5 ? `${v.slice(0, 5)}-${v.slice(5)}` : v)
              }}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="XXXXX-XXXXX"
              dir="ltr"
              className="num tracking-[0.15em] text-center text-lg"
              required
              autoFocus
            />
          </Field>
          {error && <p role="alert" className="text-irontext text-sm">{error}</p>}
          <Button type="submit" disabled={busy || recCode.replace(/-/g, '').length !== 10} className="w-full">
            {busy ? t('login.oneMoment') : t('twoStep.recUse')}
          </Button>
          <button
            type="button"
            onClick={() => { setRecovering(false); setError('') }}
            className="text-chalkdim text-sm hover:text-chalk min-h-[44px]"
          >
            {t('twoStep.recBack')}
          </button>
        </form>
      </Gate>
    )
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
        {codesLeft > 0 ? (
          <button
            type="button"
            onClick={() => { setRecovering(true); setError('') }}
            className="text-accent text-sm min-h-[44px] text-start"
          >
            {t('twoStep.recLostLink')}
          </button>
        ) : (
          <p className="text-chalkdim text-xs">{t('twoStep.lostPhone')}</p>
        )}
      </form>
    </Gate>
  )
}

// Scan the QR code, type the first code. Used inside Account, and on its own
// screen for the coach account, which can't be used without it.
export function TwoStepSetup({ onDone, onCancel }) {
  const { t } = useLanguage()
  const { refreshMfa } = useAuth()
  const { toast } = useFeedback()
  const [setup, setSetup] = useState(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const [attempt, setAttempt] = useState(0)

  // `attempt` re-runs the enrolment, so a network blip is not a dead end.
  useEffect(() => {
    let live = true
    startSetup()
      .then((s) => live && setSetup(s))
      .catch((err) => live && setError(codeError(err, t)))
    return () => {
      live = false
    }
  }, [attempt])

  function retry() {
    setError('')
    setSetup(null)
    setAttempt((n) => n + 1)
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await verifyCode(setup.factorId, code)
      // The session is aal2 now, so the codes can be made. Show them before
      // anything re-renders the app; a failure here never undoes the setup.
      try {
        await makeAndShowRecoveryCodes()
      } catch (err) {
        console.error(err)
        toast(t('twoStep.recFailed'), 'error')
      }
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
    try {
      await navigator.clipboard.writeText(setup.secret)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      console.error(err)
      toast(t('people.copyFailed'), 'error')
    }
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
      {error && <p role="alert" className="text-irontext text-sm">{error}</p>}
      <div className="flex gap-2 justify-end">
        {!setup && error && (
          <Button type="button" variant="ghost" onClick={retry}>
            {t('common.tryAgain')}
          </Button>
        )}
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
