import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ResponsiveContainer, BarChart, Bar, Cell, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine } from 'recharts'
import { Apple, Pin, PinOff, Trash2, CheckCheck, Trophy } from 'lucide-react'
import { BackChevron, ForwardChevron, ForwardArrow } from './DirectionalIcon.jsx'
import { supabase } from '../supabase.js'
import { useAdmin } from '../context/AdminContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFeedback } from '../context/FeedbackContext.jsx'
import { toLocalISODate, fmtDate } from '../lib/dates.js'
import { TERMS_VERSION } from '../legal/terms.js'
import { Card, Badge, Button, Field, LoadError } from './ui.jsx'
import {
  fetchTraineeDetail,
  weeklyCounts,
  needsReview,
  markSessionsReviewed,
  addCoachNote,
  setCoachNotePinned,
  deleteCoachNote,
  saveCoachGoal,
  adherence,
  daysSince,
  shiftDay,
} from '../lib/coach.js'
import { ACCENT, CHALK, CHALKDIM, MUTED, SURFACE } from '../theme.js'

function shortDate(lang, iso) {
  return fmtDate(lang, new Date(iso + 'T00:00:00'), { month: 'short', day: 'numeric' })
}

// One trainee from the coach's side: how consistent they are against their
// plan, what is waiting for review, weight and records, nutrition, the goal
// and the coach's private notes. Admins only (the data is admin-readable).
export default function PersonDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isAdmin, setActingAs } = useAdmin()
  const { t, lang } = useLanguage()
  const { toast, confirm } = useFeedback()
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [reload, setReload] = useState(0)
  const today = toLocalISODate()

  useEffect(() => {
    let cancelled = false
    fetchTraineeDetail(id, today)
      .then((d) => !cancelled && (setData(d), setLoadError(null)))
      .catch((e) => {
        console.error(e)
        if (!cancelled) setLoadError(e)
      })
    return () => {
      cancelled = true
    }
  }, [id, reload, today])

  const derived = useMemo(() => {
    if (!data) return null
    const scheduled = data.schedule.filter((s) => s.routine_id).length
    const planned = scheduled || data.goal?.sessions_per_week || null
    const weeks = weeklyCounts(data.sessions, 12, today)
    const counts = weeks.map((w) => w.count)
    const lastWeight = data.weights.at(-1)
    const baseline = lastWeight
      ? [...data.weights].reverse().find((w) => w.unit === lastWeight.unit && w.date <= shiftDay(lastWeight.date, -21))
      : null
    const foodDays = {}
    for (const f of data.food) {
      foodDays[f.date] ??= { kcal: 0, protein: 0 }
      foodDays[f.date].kcal += Number(f.kcal) || 0
      foodDays[f.date].protein += Number(f.protein) || 0
    }
    const days = Object.values(foodDays)
    const avg = (k) => (days.length ? days.reduce((a, d) => a + d[k], 0) / days.length : null)
    return {
      planned,
      scheduled,
      weeks,
      thisWeek: counts.at(-1),
      adh: adherence(counts, planned),
      lastSession: data.sessions[0]?.date || null,
      toReview: data.sessions.filter((s) => needsReview(s, today)),
      lastWeight,
      weightChange: baseline ? Math.round((lastWeight.weight - baseline.weight) * 10) / 10 : null,
      food: { days: days.length, kcal: avg('kcal'), protein: avg('protein') },
    }
  }, [data, today])

  if (!isAdmin) return null
  if (loadError && !data) return <LoadError onRetry={() => setReload((r) => r + 1)} />
  if (!data) return <p className="eyebrow animate-pulse py-10 text-center">{t('common.loading')}</p>

  const p = data.profile
  const name = p.full_name || p.email

  function openAccount(path = '/') {
    setActingAs(p.id, name, p.email)
    navigate(path)
  }

  async function toggleNutrition() {
    const next = !p.nutrition_enabled
    const { error } = await supabase.from('profiles').update({ nutrition_enabled: next }).eq('id', p.id)
    if (error) {
      console.error(error)
      toast(t('people.nutritionError'), 'error')
      return
    }
    setData((d) => ({ ...d, profile: { ...d.profile, nutrition_enabled: next } }))
  }

  async function markAllReviewed() {
    const ids = derived.toReview.map((s) => s.id)
    try {
      await markSessionsReviewed(p.id, ids)
      const now = new Date().toISOString()
      setData((d) => ({ ...d, sessions: d.sessions.map((s) => (ids.includes(s.id) ? { ...s, reviewed_at: now } : s)) }))
    } catch (e) {
      console.error(e)
      toast(t('feedback.saveFailed'), 'error')
    }
  }

  const stats = [
    {
      label: t('person.thisWeek'),
      value: derived.planned ? `${derived.thisWeek}/${derived.planned}` : derived.thisWeek,
    },
    { label: t('person.adherence'), value: derived.adh != null ? `${derived.adh}%` : '—', hint: t('person.adherenceHint') },
    {
      label: t('person.lastSession'),
      value: derived.lastSession ? t('person.daysAgoShort')(daysSince(derived.lastSession, today)) : '—',
    },
    {
      label: t('person.weight'),
      value: derived.lastWeight ? `${Number(derived.lastWeight.weight)}${derived.lastWeight.unit}` : '—',
      sub:
        derived.weightChange != null
          ? `\u2066${derived.weightChange > 0 ? '+' : ''}${derived.weightChange}\u2069 ${t('person.inThreeWeeks')}`
          : null,
    },
  ]

  const consent = data.consent
  const recent = data.sessions.slice(0, 8)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link to="/people" className="eyebrow inline-flex items-center gap-1 mb-2">
          <BackChevron size={14} /> {t('people.title')}
        </Link>
        <h1 className="text-3xl break-words">{name}</h1>
        <p className="text-chalkdim text-sm mt-0.5 truncate" dir="ltr" style={{ textAlign: 'start' }}>
          {p.email}
        </p>
        <div className="flex gap-2 mt-4 flex-wrap">
          <Button variant="brass" onClick={() => openAccount('/')}>
            {t('person.openAccount')} <ForwardArrow size={15} />
          </Button>
          {!p.is_admin && (
            <Button variant="ghost" onClick={toggleNutrition} aria-pressed={!!p.nutrition_enabled}>
              <Apple size={15} className={p.nutrition_enabled ? 'text-good' : ''} />
              {p.nutrition_enabled ? t('people.nutritionOn') : t('people.nutritionOff')}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="card px-4 py-3">
            <div className="eyebrow">{s.label}</div>
            <div className="num text-2xl text-chalk mt-0.5">{s.value}</div>
            {s.sub && <div className="text-xs text-chalkdim num mt-0.5">{s.sub}</div>}
          </div>
        ))}
      </div>

      {data.notes.filter((n) => n.pinned).map((n) => (
        <div key={n.id} className="card px-4 py-3 flex gap-2 items-start">
          <Pin size={14} className="text-accent shrink-0 mt-0.5" />
          <p className="text-sm whitespace-pre-wrap">{n.body}</p>
        </div>
      ))}

      <Section title={t('person.toReview')} count={derived.toReview.length}
        action={derived.toReview.length > 1 && (
          <button onClick={markAllReviewed} className="shrink-0 whitespace-nowrap text-xs text-chalkdim inline-flex items-center gap-1 min-h-9">
            <CheckCheck size={14} /> {t('person.markAllReviewed')}
          </button>
        )}
      >
        {derived.toReview.length === 0 ? (
          <p className="text-sm text-chalkdim">{t('person.allReviewed')}</p>
        ) : (
          <SessionList sessions={derived.toReview} lang={lang} t={t} today={today} onOpen={(s) => openAccount(`/history/${s.id}`)} />
        )}
      </Section>

      <Section title={t('person.consistency')} hint={derived.planned ? t('person.planLine')(derived.planned, !!derived.scheduled) : t('person.noPlan')}>
        <div className="h-36 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={derived.weeks.map((w) => ({ ...w, label: shortDate(lang, w.week) }))}>
              <XAxis dataKey="label" stroke={CHALKDIM} fontSize={10} tickLine={false} axisLine={false} interval={2} reversed={lang === 'he'} />
              <YAxis hide allowDecimals={false} domain={[0, (max) => Math.max(max, derived.planned || 0)]} />
              <Tooltip
                cursor={{ fill: 'transparent' }}
                contentStyle={{ background: SURFACE, border: 0, borderRadius: 12, fontSize: 13 }}
                labelStyle={{ color: CHALK }}
                formatter={(v) => [v, t('person.sessions')]}
              />
              {derived.planned && <ReferenceLine y={derived.planned} stroke={CHALKDIM} strokeDasharray="3 3" />}
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {derived.weeks.map((w, i) => (
                  <Cell key={w.week} fill={i === derived.weeks.length - 1 ? ACCENT : derived.planned && w.count >= derived.planned ? CHALKDIM : MUTED} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>

      {data.weights.length > 1 && (
        <Section
          title={t('person.bodyWeight')}
          hint={data.goal?.target_weight ? t('person.targetWeight')(Number(data.goal.target_weight), derived.lastWeight.unit) : null}
        >
          <div className="h-36 -mx-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.weights.filter((w) => w.date >= shiftDay(today, -182)).map((w) => ({ ...w, weight: Number(w.weight), label: shortDate(lang, w.date) }))}>
                <XAxis dataKey="label" stroke={CHALKDIM} fontSize={10} tickLine={false} axisLine={false} minTickGap={24} reversed={lang === 'he'} />
                <YAxis
                  hide
                  domain={[
                    (min) => Math.floor(Math.min(min, Number(data.goal?.target_weight) || min) - 1),
                    (max) => Math.ceil(Math.max(max, Number(data.goal?.target_weight) || max) + 1),
                  ]}
                />
                <Tooltip contentStyle={{ background: SURFACE, border: 0, borderRadius: 12, fontSize: 13 }} labelStyle={{ color: CHALK }} formatter={(v) => [v, t('person.weight')]} />
                {data.goal?.target_weight && <ReferenceLine y={Number(data.goal.target_weight)} stroke={CHALKDIM} strokeDasharray="3 3" />}
                <Line type="monotone" dataKey="weight" stroke={ACCENT} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Section>
      )}

      {data.prs.length > 0 && (
        <Section title={t('person.records')}>
          <ul className="flex flex-col gap-2">
            {data.prs.slice(0, 6).map((r, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <Trophy size={13} className="text-accent shrink-0" />
                <span className="flex-1 min-w-0 truncate">{r.detail}</span>
                <span className="text-xs text-chalkdim num shrink-0">{fmtDate(lang, new Date(r.sent_at), { month: 'short', day: 'numeric' })}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {p.nutrition_enabled && (
        <Section title={t('person.nutrition')} hint={t('person.lastSevenDays')}>
          <div className="grid grid-cols-3 gap-2 text-center">
            <MiniStat label={t('person.daysLogged')} value={`${derived.food.days}/7`} />
            <MiniStat
              label={t('person.avgKcal')}
              value={derived.food.kcal != null ? Math.round(derived.food.kcal) : '—'}
              sub={data.targets?.kcal ? t('person.ofTarget')(data.targets.kcal) : null}
            />
            <MiniStat
              label={t('person.avgProtein')}
              value={derived.food.protein != null ? `${Math.round(derived.food.protein)}g` : '—'}
              sub={data.targets?.protein ? t('person.ofTarget')(`${Math.round(data.targets.protein)}g`) : null}
            />
          </div>
        </Section>
      )}

      <GoalForm
        traineeId={p.id}
        goal={data.goal}
        scheduled={derived.scheduled}
        today={today}
        t={t}
        lang={lang}
        onSaved={(goal) => setData((d) => ({ ...d, goal }))}
        onError={() => toast(t('feedback.saveFailed'), 'error')}
      />

      <Notes
        traineeId={p.id}
        notes={data.notes}
        t={t}
        lang={lang}
        confirm={confirm}
        onChange={(notes) => setData((d) => ({ ...d, notes }))}
        onError={() => toast(t('feedback.saveFailed'), 'error')}
      />

      {recent.length > 0 && (
        <Section title={t('person.recentSessions')}>
          <SessionList sessions={recent} lang={lang} t={t} today={today} onOpen={(s) => openAccount(`/history/${s.id}`)} showReviewed />
        </Section>
      )}

      <p className={`text-xs ${!consent || consent.version < TERMS_VERSION ? 'text-accent' : 'text-chalkdim'}`}>
        {!consent
          ? t('people.termsNotAccepted')
          : consent.version < TERMS_VERSION
            ? t('people.termsOutdated', { version: consent.version })
            : t('people.termsAccepted', { date: fmtDate(lang, new Date(consent.accepted_at)) })}
        {consent?.variant === 'minor' && consent.guardian_name ? ` · ${t('people.guardian', { name: consent.guardian_name })}` : ''}
      </p>
    </div>
  )
}

function Section({ title, hint, count, action, children }) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base text-chalk inline-flex items-center gap-2">
            {title}
            {count > 0 && <span className="num text-xs rounded-full bg-accent text-ink px-1.5 min-w-5 text-center">{count}</span>}
          </h2>
          {hint && <p className="text-xs text-chalkdim mt-0.5">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  )
}

function MiniStat({ label, value, sub }) {
  return (
    <div className="rounded-[14px] bg-surface2 px-2 py-2.5">
      <div className="num text-lg text-chalk leading-tight">{value}</div>
      <div className="text-[11px] text-chalkdim leading-tight mt-0.5">{label}</div>
      {sub && <div className="text-[11px] text-chalkdim num leading-tight">{sub}</div>}
    </div>
  )
}

function SessionList({ sessions, lang, t, today, onOpen, showReviewed }) {
  return (
    <ul className="flex flex-col -my-1">
      {sessions.map((s) => (
        <li key={s.id}>
          <button onClick={() => onOpen(s)} className="press-row w-full flex items-center gap-3 py-2 text-start">
            <span className="flex-1 min-w-0">
              <span className="block truncate text-sm">{s.routine_name}</span>
              <span className="block text-xs text-chalkdim num">
                {fmtDate(lang, new Date(s.date + 'T00:00:00'), { weekday: 'short', month: 'short', day: 'numeric' })}
                {s.duration_minutes ? ` · ${t('person.minutes')(s.duration_minutes)}` : ''}
              </span>
            </span>
            {showReviewed && (needsReview(s, today) ? <Badge>{t('person.new')}</Badge> : s.trainer_comment ? <Badge>{t('person.commented')}</Badge> : null)}
            <ForwardChevron size={15} className="text-chalkdim shrink-0" />
          </button>
        </li>
      ))}
    </ul>
  )
}

function GoalForm({ traineeId, goal, scheduled, today, t, lang, onSaved, onError }) {
  const [text, setText] = useState(goal?.goal || '')
  const [target, setTarget] = useState(goal?.target_weight ?? '')
  const [perWeek, setPerWeek] = useState(goal?.sessions_per_week ?? '')
  const [checkin, setCheckin] = useState(goal?.next_checkin || '')
  const [saving, setSaving] = useState(false)

  const dirty =
    text !== (goal?.goal || '') ||
    String(target) !== String(goal?.target_weight ?? '') ||
    String(perWeek) !== String(goal?.sessions_per_week ?? '') ||
    checkin !== (goal?.next_checkin || '')

  async function save(overrides = {}) {
    setSaving(true)
    try {
      const num = (v) => (v === '' || v == null ? null : Number(v))
      const row = await saveCoachGoal(traineeId, {
        goal: text.trim() || null,
        target_weight: num(target),
        sessions_per_week: num(perWeek),
        next_checkin: checkin || null,
        ...overrides,
      })
      if (overrides.next_checkin !== undefined) setCheckin(overrides.next_checkin || '')
      onSaved(row)
    } catch (e) {
      console.error(e)
      onError()
    } finally {
      setSaving(false)
    }
  }

  const due = checkin && checkin <= today

  return (
    <Section title={t('person.goalTitle')}>
      <Field label={t('person.goal')}>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder={t('person.goalPlaceholder')} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('person.targetWeightLabel')}>
          <input type="number" inputMode="decimal" step="0.1" min="1" value={target} onChange={(e) => setTarget(e.target.value)} />
        </Field>
        {scheduled ? (
          <div className="flex flex-col gap-1.5">
            <span className="eyebrow">{t('person.perWeek')}</span>
            <p className="text-sm text-chalkdim min-h-[44px] flex items-center">{t('person.fromSchedule')(scheduled)}</p>
          </div>
        ) : (
          <Field label={t('person.perWeek')}>
            <input type="number" inputMode="numeric" min="1" max="14" value={perWeek} onChange={(e) => setPerWeek(e.target.value)} />
          </Field>
        )}
      </div>
      <Field label={t('person.nextCheckin')}>
        <input type="date" value={checkin} onChange={(e) => setCheckin(e.target.value)} className={due ? 'text-accent' : ''} />
      </Field>
      <div className="flex gap-2 flex-wrap">
        {dirty && (
          <Button variant="brass" onClick={() => save()} disabled={saving}>
            {t('common.save')}
          </Button>
        )}
        {due && !dirty && (
          <Button variant="ghost" onClick={() => save({ next_checkin: shiftDay(today, 7) })} disabled={saving}>
            {t('person.checkinDone')}
          </Button>
        )}
      </div>
      {due && <p className="text-xs text-accent">{t('person.checkinDue')(fmtDate(lang, new Date(checkin + 'T00:00:00'), { month: 'short', day: 'numeric' }))}</p>}
    </Section>
  )
}

function Notes({ traineeId, notes, t, lang, confirm, onChange, onError }) {
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  async function add() {
    const body = draft.trim()
    if (!body) return
    setSaving(true)
    try {
      const row = await addCoachNote(traineeId, body)
      onChange([row, ...notes])
      setDraft('')
    } catch (e) {
      console.error(e)
      onError()
    } finally {
      setSaving(false)
    }
  }

  async function togglePin(n) {
    try {
      await setCoachNotePinned(n.id, !n.pinned)
      onChange(notes.map((x) => (x.id === n.id ? { ...x, pinned: !n.pinned } : x)))
    } catch (e) {
      console.error(e)
      onError()
    }
  }

  async function remove(n) {
    if (!(await confirm({ title: t('person.deleteNote'), confirmLabel: t('common.delete'), danger: true }))) return
    try {
      await deleteCoachNote(n.id)
      onChange(notes.filter((x) => x.id !== n.id))
    } catch (e) {
      console.error(e)
      onError()
    }
  }

  return (
    <Section title={t('person.notes')} hint={t('person.notesHint')}>
      <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} maxLength={4000} placeholder={t('person.notePlaceholder')} />
      {draft.trim() && (
        <div>
          <Button variant="brass" onClick={add} disabled={saving}>
            {t('person.addNote')}
          </Button>
        </div>
      )}
      {notes.length > 0 && (
        <ul className="flex flex-col divide-y divide-line">
          {notes.map((n) => (
            <li key={n.id} className="py-2.5 flex gap-2 items-start">
              <div className="flex-1 min-w-0">
                <p className="text-sm whitespace-pre-wrap break-words">{n.body}</p>
                <p className="text-[11px] text-chalkdim mt-1 num">{fmtDate(lang, new Date(n.created_at), { month: 'short', day: 'numeric', year: 'numeric' })}</p>
              </div>
              <button onClick={() => togglePin(n)} className="hit text-chalkdim p-1" aria-label={n.pinned ? t('person.unpin') : t('person.pin')}>
                {n.pinned ? <PinOff size={15} className="text-accent" /> : <Pin size={15} />}
              </button>
              <button onClick={() => remove(n)} className="hit text-chalkdim p-1" aria-label={t('common.delete')}>
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
