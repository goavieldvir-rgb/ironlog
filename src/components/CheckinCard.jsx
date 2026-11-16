import React, { useEffect, useState } from 'react'
import { ClipboardCheck, Check } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFeedback } from '../context/FeedbackContext.jsx'
import { toLocalISODate, weekStartOf } from '../lib/dates.js'
import { fetchMyQuestions, fetchAnswer, saveAnswer, questionText } from '../lib/checkins.js'
import { Button, Card } from './ui.jsx'

// Home: this week's check-in from the coach, until it's answered. Shows
// nothing when the coach has no questions (or before the SQL is run).
export default function CheckinCard({ uid }) {
  const { t, lang } = useLanguage()
  const { toast } = useFeedback()
  const week = weekStartOf(toLocalISODate())
  const [questions, setQuestions] = useState(null)
  const [answered, setAnswered] = useState(true)
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState({})
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!uid) return
    let cancelled = false
    fetchMyQuestions().then(async (qs) => {
      if (cancelled || !qs.length) return
      const a = await fetchAnswer(uid, week)
      if (cancelled) return
      setQuestions(qs)
      setAnswered(!!a)
    })
    return () => {
      cancelled = true
    }
  }, [uid, week])

  if (done) {
    return (
      <Card className="flex items-center gap-2 text-sm">
        <Check size={16} className="text-good" /> {t('checkin.sent')}
      </Card>
    )
  }
  if (!questions || answered) return null

  const filled = questions.filter((q) => values[q.id] !== undefined && String(values[q.id]).trim() !== '').length

  async function submit(e) {
    e.preventDefault()
    if (!filled) return
    setSaving(true)
    try {
      const answers = Object.fromEntries(
        questions.filter((q) => values[q.id] !== undefined && String(values[q.id]).trim() !== '').map((q) => [q.id, q.type === 'text' ? String(values[q.id]).trim() : Number(values[q.id])]),
      )
      await saveAnswer(uid, week, answers, questions)
      setDone(true)
    } catch (err) {
      console.error(err)
      toast(t('feedback.saveFailed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <Card className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <ClipboardCheck size={20} className="text-accent shrink-0" />
          <div className="min-w-0">
            <p className="text-chalk">{t('checkin.title')}</p>
            <p className="text-xs text-chalkdim">{t('checkin.subtitle', { n: questions.length })}</p>
          </div>
        </div>
        <Button variant="brass" onClick={() => setOpen(true)}>
          {t('checkin.start')}
        </Button>
      </Card>
    )
  }

  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <ClipboardCheck size={18} className="text-accent" />
          <h2 className="text-lg">{t('checkin.title')}</h2>
        </div>
        {questions.map((q) => (
          <div key={q.id} className="flex flex-col gap-2">
            <label htmlFor={`cq-${q.id}`} className="text-sm text-chalk" dir="auto">
              {questionText(q, lang)}
            </label>
            {q.type === 'scale' && (
              <div role="radiogroup" aria-label={questionText(q, lang)} className="grid grid-cols-5 gap-1.5" dir="ltr">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={values[q.id] === n}
                    onClick={() => setValues((v) => ({ ...v, [q.id]: n }))}
                    className={`min-h-11 rounded-[12px] num text-base ${values[q.id] === n ? 'bg-accent text-onaccent' : 'bg-surface2 text-chalkdim hover:text-chalk'}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
            {q.type === 'number' && (
              <input
                id={`cq-${q.id}`}
                type="number"
                inputMode="decimal"
                step="any"
                value={values[q.id] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [q.id]: e.target.value }))}
                className="w-32"
              />
            )}
            {q.type === 'text' && (
              <textarea
                id={`cq-${q.id}`}
                rows={3}
                maxLength={2000}
                dir="auto"
                value={values[q.id] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [q.id]: e.target.value }))}
              />
            )}
          </div>
        ))}
        <p className="text-xs text-chalkdim">{t('checkin.skipHint')}</p>
        <div className="flex gap-2">
          <Button type="submit" variant="brass" disabled={saving || !filled}>
            {t('checkin.send')}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      </form>
    </Card>
  )
}
