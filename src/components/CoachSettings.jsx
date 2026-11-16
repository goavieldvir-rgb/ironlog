import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Plus, Trash2 } from 'lucide-react'
import { BackChevron } from './DirectionalIcon.jsx'
import { useAdmin } from '../context/AdminContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFeedback } from '../context/FeedbackContext.jsx'
import { useCoachSettings, saveCoachSettings, TASK_KINDS } from '../lib/coachSettings.js'
import { BUILT_IN, customKey, measurementLabel, fetchMeasurementSetup } from '../lib/measurements.js'
import { PALETTE, rgbOf, resizeLogo } from '../lib/brand.js'
import { SUGGESTED_QUESTIONS, QUESTION_TYPES, MAX_QUESTIONS, newQuestionId } from '../lib/checkins.js'
import { Card, Button } from './ui.jsx'
import { PageLoader } from './Loading.jsx'

// A coach's own settings, for all their trainees: the default measurement
// list, which To do items show up and when, the People "behind" flag, the
// check-in interval and record alerts.
export default function CoachSettings() {
  const { isCoach, profile, refreshBrand } = useAdmin()
  const { t, lang } = useLanguage()
  const { toast } = useFeedback()
  const [state] = useCoachSettings(isCoach ? profile?.id : null)
  const [form, setForm] = useState(null)
  const [types, setTypes] = useState([])
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)
  const [snippetDraft, setSnippetDraft] = useState('')

  useEffect(() => {
    if (state) setForm(state.settings)
  }, [state])
  useEffect(() => {
    if (profile?.id && isCoach) fetchMeasurementSetup(profile.id).then((s) => setTypes(s.types))
  }, [profile?.id, isCoach])

  if (!isCoach) return null
  if (!state || !form) return <PageLoader />

  const saved = lastSaved || state.settings
  const dirty = JSON.stringify(form) !== JSON.stringify(saved)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const toggleIn = (key, value) => set({ [key]: form[key].includes(value) ? form[key].filter((x) => x !== value) : [...form[key], value] })
  const num = (key, min, max) => ({
    type: 'number',
    inputMode: 'numeric',
    min,
    max,
    step: 1,
    value: form[key],
    onChange: (e) => set({ [key]: e.target.value === '' ? '' : Number(e.target.value) }),
    onBlur: () => set({ [key]: Math.min(max, Math.max(min, Math.round(Number(form[key])) || saved[key])) }),
    className: 'w-16 text-center',
  })

  async function save() {
    setSaving(true)
    try {
      const patch = { default_measurements: form.default_measurements }
      if (state.prefsAvailable) {
        for (const k of ['tasks_off', 'weigh_days', 'food_days', 'behind_pct', 'checkin_days', 'pr_alerts']) patch[k] = form[k]
      }
      if (state.checkinAvailable) {
        // Questions with no text in either language are dropped.
        patch.checkin_questions = form.checkin_questions
          .map((q) => ({ id: q.id, type: q.type, en: (q.en || '').trim(), he: (q.he || '').trim() }))
          .filter((q) => q.en || q.he)
      }
      if (state.brandAvailable) {
        patch.brand_name = form.brand_name?.trim() || null
        patch.brand_color = form.brand_color || null
        patch.brand_logo = form.brand_logo || null
      }
      if (state.extrasAvailable) {
        patch.snippets = form.snippets
        patch.invite_text = form.invite_text?.trim() || null
      }
      const row = await saveCoachSettings(profile.id, patch)
      setLastSaved(row)
      setForm(row)
      toast(t('coachSettings.saved'))
      refreshBrand()
    } catch (e) {
      console.error(e)
      toast(t('feedback.saveFailed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const measureOptions = [...BUILT_IN.map((b) => b.key), ...types.filter((ct) => !ct.archived).map((ct) => customKey(ct.id))]

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <div>
        <Link to="/people" className="eyebrow inline-flex items-center gap-1 mb-2">
          <BackChevron size={14} /> {t('people.title')}
        </Link>
        <h1 className="text-3xl">{t('coachSettings.title')}</h1>
        <p className="text-chalkdim text-sm mt-1">{t('coachSettings.subtitle')}</p>
      </div>

      {!state.available && <p className="text-sm text-accent">{t('measure.notReady')}</p>}

      <Card className="flex flex-col gap-3">
        <h2 className="text-base text-chalk">{t('coachSettings.measureTitle')}</h2>
        <p className="text-xs text-chalkdim -mt-2">{t('coachSettings.measureHint')}</p>
        <div className="flex gap-2 flex-wrap">
          {measureOptions.map((k) => {
            const on = form.default_measurements.includes(k)
            return (
              <button
                key={k}
                type="button"
                disabled={!state.available}
                aria-pressed={on}
                onClick={() => toggleIn('default_measurements', k)}
                className={`min-h-9 px-3 rounded-full text-sm border inline-flex items-center gap-1 ${on ? 'bg-accent text-ink border-accent' : 'border-line text-chalkdim hover:text-chalk'}`}
              >
                {on && <Check size={13} />}
                <bdi>{measurementLabel(k, types, t, lang)}</bdi>
              </button>
            )
          })}
        </div>
      </Card>

      {state.available && !state.prefsAvailable && <p className="text-sm text-accent">{t('coachSettings.notReady')}</p>}

      <fieldset disabled={!state.prefsAvailable} className="flex flex-col gap-5 disabled:opacity-60">
        <Card className="flex flex-col gap-3">
          <h2 className="text-base text-chalk">{t('coachSettings.tasksTitle')}</h2>
          <p className="text-xs text-chalkdim -mt-2">{t('coachSettings.tasksHint')}</p>
          <ul className="flex flex-col divide-y divide-line">
            {TASK_KINDS.map((k) => {
              const on = !form.tasks_off.includes(k)
              return (
                <li key={k} className="py-2.5 flex flex-col gap-1.5">
                  <label className="flex items-center gap-3 min-h-9 cursor-pointer">
                    <input type="checkbox" checked={on} onChange={() => toggleIn('tasks_off', k)} className="w-5 h-5" />
                    <span className="text-sm">{t(`coachSettings.task.${k}`)}</span>
                  </label>
                  {on && k === 'weigh' && (
                    <div className="flex items-center gap-2 text-sm text-chalkdim ps-8 flex-wrap">
                      {t('coachSettings.after')} <input {...num('weigh_days', 3, 90)} aria-label={t('coachSettings.task.weigh')} /> {t('coachSettings.weighDays')}
                    </div>
                  )}
                  {on && k === 'food' && (
                    <div className="flex items-center gap-2 text-sm text-chalkdim ps-8 flex-wrap">
                      {t('coachSettings.after')} <input {...num('food_days', 1, 30)} aria-label={t('coachSettings.task.food')} /> {t('coachSettings.foodDays')}
                    </div>
                  )}
                  {on && k === 'quiet' && <p className="text-xs text-chalkdim ps-8">{t('coachSettings.quietHint')}</p>}
                </li>
              )
            })}
          </ul>
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="text-base text-chalk">{t('coachSettings.peopleTitle')}</h2>
          <div className="flex items-center gap-2 text-sm flex-wrap">
            {t('coachSettings.behindBefore')} <input {...num('behind_pct', 10, 100)} aria-label={t('coachSettings.peopleTitle')} /> {t('coachSettings.behindAfter')}
          </div>
          <div className="flex items-center gap-2 text-sm flex-wrap border-t border-line pt-3">
            {t('coachSettings.checkinBefore')} <input {...num('checkin_days', 1, 90)} aria-label={t('coachSettings.checkinBefore')} /> {t('coachSettings.checkinAfter')}
          </div>
        </Card>

        <Card className="flex flex-col gap-2">
          <label className="flex items-center gap-3 min-h-9 cursor-pointer">
            <input type="checkbox" checked={form.pr_alerts} onChange={() => set({ pr_alerts: !form.pr_alerts })} className="w-5 h-5" />
            <span className="text-base text-chalk">{t('coachSettings.prAlerts')}</span>
          </label>
          <p className="text-xs text-chalkdim ps-8">{t('coachSettings.prAlertsHint')}</p>
        </Card>
      </fieldset>

      {state.prefsAvailable && !state.extrasAvailable && <p className="text-sm text-accent">{t('coachSettings.extrasNotReady')}</p>}

      <fieldset disabled={!state.extrasAvailable} className="flex flex-col gap-5 disabled:opacity-60">
        <Card className="flex flex-col gap-3">
          <h2 className="text-base text-chalk">{t('coachSettings.snippetsTitle')}</h2>
          <p className="text-xs text-chalkdim -mt-2">{t('coachSettings.snippetsHint')}</p>
          {form.snippets.length > 0 && (
            <ul className="flex flex-col divide-y divide-line">
              {form.snippets.map((sn, i) => (
                <li key={i} className="py-2 flex items-start gap-2">
                  <p className="flex-1 text-sm whitespace-pre-wrap break-words" dir="auto">{sn}</p>
                  <button type="button" onClick={() => set({ snippets: form.snippets.filter((_, j) => j !== i) })} className="hit text-chalkdim p-1" aria-label={t('common.delete')}>
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {form.snippets.length < 30 && (
            <div className="flex gap-2 items-start">
              <textarea value={snippetDraft} onChange={(e) => setSnippetDraft(e.target.value)} rows={2} maxLength={500} placeholder={t('coachSettings.snippetPlaceholder')} className="flex-1" dir="auto" />
              <Button
                variant="ghost"
                disabled={!snippetDraft.trim()}
                onClick={() => {
                  set({ snippets: [...form.snippets, snippetDraft.trim()] })
                  setSnippetDraft('')
                }}
                aria-label={t('common.add')}
              >
                <Plus size={16} />
              </Button>
            </div>
          )}
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="text-base text-chalk">{t('coachSettings.checkinTitle')}</h2>
          <p className="text-xs text-chalkdim -mt-2">{t('coachSettings.checkinHint')}</p>
          {!state.checkinAvailable ? (
            <p className="text-xs text-accent">{t('coachSettings.checkinNotReady')}</p>
          ) : (
            <>
              {form.checkin_questions.map((q, i) => {
                const setQ = (patch) => set({ checkin_questions: form.checkin_questions.map((x, j) => (j === i ? { ...x, ...patch } : x)) })
                return (
                  <div key={q.id} className="flex flex-col gap-2 rounded-[14px] border border-line p-3">
                    <div className="flex items-center gap-2">
                      <span className="num text-xs text-chalkdim w-5">{i + 1}</span>
                      <select value={q.type} onChange={(e) => setQ({ type: e.target.value })} className="flex-1" aria-label={t('coachSettings.questionType')}>
                        {QUESTION_TYPES.map((ty) => (
                          <option key={ty} value={ty}>
                            {t(`coachSettings.qType.${ty}`)}
                          </option>
                        ))}
                      </select>
                      <button type="button" onClick={() => set({ checkin_questions: form.checkin_questions.filter((_, j) => j !== i) })} className="hit text-chalkdim p-1" aria-label={t('common.delete')}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <input value={q.en || ''} onChange={(e) => setQ({ en: e.target.value })} maxLength={200} dir="ltr" placeholder={t('coachSettings.questionEn')} aria-label={t('coachSettings.questionEn')} />
                    <input value={q.he || ''} onChange={(e) => setQ({ he: e.target.value })} maxLength={200} dir="rtl" placeholder={t('coachSettings.questionHe')} aria-label={t('coachSettings.questionHe')} />
                  </div>
                )
              })}
              <div className="flex gap-2 flex-wrap">
                {form.checkin_questions.length < MAX_QUESTIONS && (
                  <Button variant="ghost" onClick={() => set({ checkin_questions: [...form.checkin_questions, { id: newQuestionId(), type: 'scale', en: '', he: '' }] })}>
                    <Plus size={16} /> {t('coachSettings.addQuestion')}
                  </Button>
                )}
                {form.checkin_questions.length === 0 && (
                  <Button variant="ghost" onClick={() => set({ checkin_questions: SUGGESTED_QUESTIONS })}>
                    {t('coachSettings.useSuggested')}
                  </Button>
                )}
              </div>
            </>
          )}
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="text-base text-chalk">{t('brand.title')}</h2>
          <p className="text-xs text-chalkdim -mt-2">{t('brand.hint')}</p>
          {!state.brandAvailable ? (
            <p className="text-xs text-accent">{t('brand.notReady')}</p>
          ) : (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="eyebrow">{t('brand.name')}</span>
                <input value={form.brand_name || ''} onChange={(e) => set({ brand_name: e.target.value })} maxLength={40} dir="auto" placeholder={profile?.full_name || ''} />
              </label>
              <div className="flex flex-col gap-1.5">
                <span className="eyebrow">{t('brand.color')}</span>
                <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label={t('brand.color')}>
                  {Object.keys(PALETTE).map((c) => {
                    const on = (form.brand_color || 'ember') === c
                    return (
                      <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        aria-label={t(`brand.colors.${c}`)}
                        title={t(`brand.colors.${c}`)}
                        onClick={() => set({ brand_color: c === 'ember' ? null : c })}
                        className={`w-10 h-10 rounded-full inline-flex items-center justify-center ${on ? 'ring-2 ring-chalk ring-offset-2 ring-offset-surface' : ''}`}
                        style={{ background: rgbOf(c) }}
                      >
                        {on && <Check size={16} className="text-ink" />}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {form.brand_logo ? (
                  <img src={form.brand_logo} alt={t('brand.logo')} className="w-14 h-14 rounded-xl object-cover" />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-surface2" />
                )}
                <label className="inline-flex items-center gap-2 min-h-11 px-4 rounded-full border border-line text-sm cursor-pointer hover:text-chalk">
                  {form.brand_logo ? t('brand.changeLogo') : t('brand.addLogo')}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      e.target.value = ''
                      try {
                        set({ brand_logo: await resizeLogo(file) })
                      } catch {
                        toast(t('brand.logoFailed'), 'error')
                      }
                    }}
                  />
                </label>
                {form.brand_logo && (
                  <button type="button" onClick={() => set({ brand_logo: null })} className="text-sm text-chalkdim underline min-h-11">
                    {t('brand.removeLogo')}
                  </button>
                )}
              </div>
              <p className="text-xs text-chalkdim">{t('brand.preview', { name: form.brand_name?.trim() || profile?.full_name || '' })}</p>
            </>
          )}
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="text-base text-chalk">{t('coachSettings.inviteTitle')}</h2>
          <p className="text-xs text-chalkdim -mt-2">{t('coachSettings.inviteHint')}</p>
          <textarea
            value={form.invite_text || ''}
            onChange={(e) => set({ invite_text: e.target.value })}
            rows={5}
            maxLength={1000}
            dir="auto"
            placeholder={t('people.inviteMessage')('{name}', '{link}')}
          />
        </Card>
      </fieldset>

      <div className="sticky bottom-24 lg:bottom-4 flex gap-2">
        <Button variant="brass" onClick={save} disabled={!dirty || saving || !state.available}>
          {t('common.save')}
        </Button>
        {dirty && (
          <Button variant="ghost" onClick={() => setForm(saved)}>
            {t('common.cancel')}
          </Button>
        )}
      </div>
    </div>
  )
}
