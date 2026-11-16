import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { BackChevron } from './DirectionalIcon.jsx'
import { useAdmin } from '../context/AdminContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFeedback } from '../context/FeedbackContext.jsx'
import { useCoachSettings, saveCoachSettings, TASK_KINDS } from '../lib/coachSettings.js'
import { BUILT_IN, customKey, measurementLabel, fetchMeasurementSetup } from '../lib/measurements.js'
import { Card, Button } from './ui.jsx'
import { PageLoader } from './Loading.jsx'

// A coach's own settings, for all their trainees: the default measurement
// list, which To do items show up and when, the People "behind" flag, the
// check-in interval and record alerts.
export default function CoachSettings() {
  const { isCoach, profile } = useAdmin()
  const { t, lang } = useLanguage()
  const { toast } = useFeedback()
  const [state] = useCoachSettings(isCoach ? profile?.id : null)
  const [form, setForm] = useState(null)
  const [types, setTypes] = useState([])
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)

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
      const row = await saveCoachSettings(profile.id, patch)
      setLastSaved(row)
      setForm(row)
      toast(t('coachSettings.saved'))
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
