import React, { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFeedback } from '../context/FeedbackContext.jsx'
import { fetchLatestConsent, recordConsent } from '../lib/db.js'
import { terms, termsPlainText, hashText, TERMS_VERSION, TERMS_DOC_KEY } from '../legal/terms.js'
import { Button, Card, Field } from './ui.jsx'

// Shown after signing in, before anything else, until the current version
// of the terms has been accepted. Gating here rather than at signup means
// it also reaches everyone who already has an account, and asks again
// whenever the wording changes.
export default function ConsentGate({ uid, children }) {
  const { t, lang } = useLanguage()
  const { toast } = useFeedback()
  const [state, setState] = useState('checking') // checking | needed | ok
  const [isMinor, setIsMinor] = useState(false)
  const [guardianName, setGuardianName] = useState('')
  const [guardianContact, setGuardianContact] = useState('')
  const [readToEnd, setReadToEnd] = useState(false)
  const [saving, setSaving] = useState(false)
  const scrollRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    if (!uid) return
    setState('checking')
    fetchLatestConsent(uid, TERMS_DOC_KEY)
      .then((row) => {
        if (cancelled) return
        setState(row && row.version >= TERMS_VERSION ? 'ok' : 'needed')
      })
      .catch((err) => {
        console.error(err)
        // If the check itself fails (offline, or the table isn't there
        // yet), don't lock someone out of their own training log.
        if (!cancelled) setState('ok')
      })
    return () => {
      cancelled = true
    }
  }, [uid])

  // Switching between the adult and under-18 text means a different
  // document, so the "read it" check starts again.
  useEffect(() => {
    setReadToEnd(false)
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [isMinor, lang])

  function onScroll(e) {
    const el = e.currentTarget
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setReadToEnd(true)
  }

  // A short document on a big screen may not scroll at all — in that case
  // it has already been seen in full.
  useEffect(() => {
    const el = scrollRef.current
    if (el && el.scrollHeight <= el.clientHeight + 24) setReadToEnd(true)
  }, [isMinor, lang, state])

  const variant = isMinor ? 'minor' : 'adult'
  const doc = terms[lang]?.[variant] || terms.en[variant]
  const guardianOk = !isMinor || (guardianName.trim() && guardianContact.trim())

  async function accept() {
    setSaving(true)
    try {
      await recordConsent(uid, {
        docKey: TERMS_DOC_KEY,
        version: TERMS_VERSION,
        variant,
        lang,
        // Fingerprint of the exact wording shown, so the record says what
        // was agreed to, not just that something was.
        textSha256: await hashText(termsPlainText(lang, variant)),
        guardianName: guardianName.trim(),
        guardianContact: guardianContact.trim(),
      })
      setState('ok')
    } catch (err) {
      console.error(err)
      toast(t('feedback.saveFailed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  if (state === 'checking') return null
  if (state === 'ok') return children

  return (
    <div className="min-h-screen bg-ink px-4 py-8 flex justify-center">
      <div className="w-full max-w-lg flex flex-col gap-4">
        <div>
          <div className="eyebrow mb-1">Ironlog</div>
          <h1 className="text-3xl">{doc.title}</h1>
          <p className="text-chalkdim text-sm mt-1">{doc.intro}</p>
        </div>

        <Card className="flex items-center justify-between gap-3">
          <span className="text-sm">{t('consent.under18')}</span>
          <button
            type="button"
            onClick={() => setIsMinor((v) => !v)}
            aria-pressed={isMinor}
            className="press flex rounded-md bg-surface2 p-0.5 text-xs"
          >
            <span className={`px-3 py-1.5 rounded ${!isMinor ? 'bg-ink text-chalk' : 'text-chalkdim'}`}>{t('common.no')}</span>
            <span className={`px-3 py-1.5 rounded ${isMinor ? 'bg-ink text-chalk' : 'text-chalkdim'}`}>{t('common.yes')}</span>
          </button>
        </Card>

        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="card p-5 max-h-[50vh] overflow-y-auto flex flex-col gap-4"
        >
          {doc.sections.map((s) => (
            <div key={s.heading}>
              <h2 className="text-base mb-1">{s.heading}</h2>
              <p className="text-chalkdim text-sm leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>

        {isMinor && (
          <Card className="flex flex-col gap-3">
            <Field label={doc.guardianName}>
              <input value={guardianName} onChange={(e) => setGuardianName(e.target.value)} className="w-full" />
            </Field>
            <Field label={doc.guardianContact}>
              <input value={guardianContact} onChange={(e) => setGuardianContact(e.target.value)} dir="ltr" className="w-full" />
            </Field>
            <p className="text-chalkdim text-xs">{t('consent.guardianNote')}</p>
          </Card>
        )}

        {!readToEnd && <p className="text-chalkdim text-xs text-center">{t('consent.scrollHint')}</p>}

        <Button onClick={accept} disabled={!readToEnd || !guardianOk || saving} className="w-full">
          {saving ? t('consent.saving') : doc.accept}
        </Button>

        <p className="text-chalkdim text-xs text-center">{t('consent.recordNote')}</p>
      </div>
    </div>
  )
}
