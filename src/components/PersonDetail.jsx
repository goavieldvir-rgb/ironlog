import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ResponsiveContainer, BarChart, Bar, Cell, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine } from 'recharts'
import { Apple, GraduationCap, Undo2, UserX, UserCheck, Pin, PinOff, Trash2, CheckCheck, Trophy, ChevronDown, Pencil, Plus, Check } from 'lucide-react'
import { BackChevron, ForwardChevron, ForwardArrow } from './DirectionalIcon.jsx'
import { supabase } from '../supabase.js'
import { useAdmin } from '../context/AdminContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useCollection, copyRoutineToUser } from '../lib/db.js'
import { useCoachSettings } from '../lib/coachSettings.js'
import { useScrollLock } from '../lib/scrollLock.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFeedback } from '../context/FeedbackContext.jsx'
import { toLocalISODate, fmtDate } from '../lib/dates.js'
import { TERMS_VERSION } from '../legal/terms.js'
import { Card, Badge, Button, Field, LoadError } from './ui.jsx'
import { PageLoader } from './Loading.jsx'
import ProgressPhotos from './ProgressPhotos.jsx'
import { MessageThread } from './Messages.jsx'
import { useMessagesAvailable } from '../lib/messages.js'
import { RoutineExercises } from './RoutineView.jsx'
import {
  BUILT_IN,
  customKey,
  typeFor,
  measurementLabel,
  convert,
  round1,
  fetchMeasurementSetup,
  setPersonMeasurements,
  clearPersonMeasurements,
  setDefaultMeasurements,
  addMeasurementType,
  setMeasurementTypeArchived,
} from '../lib/measurements.js'
import { questionText } from '../lib/checkins.js'
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
  useOwnerName,
} from '../lib/coach.js'
import { sessionTitle } from '../lib/names.js'
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
  const { isAdmin, isOwner, isCoach, profile: myProfile, setActingAs } = useAdmin()
  const ownerName = useOwnerName(isCoach && !isOwner)
  const [coachSettings] = useCoachSettings(isCoach ? myProfile?.id : null)
  const { t, lang } = useLanguage()
  const { toast, confirm } = useFeedback()
  const { user: me } = useAuth()
  const messagesOn = useMessagesAvailable()
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [reload, setReload] = useState(0)
  const [coaches, setCoaches] = useState([])
  const today = toLocalISODate()

  // Another trainee's page reuses this component: drop the previous one's
  // data so their numbers never show under the new name.
  useEffect(() => {
    setData(null)
    setLoadError(null)
  }, [id])

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

  // The coaches the owner can hand a trainee to (names only; the owner
  // never sees their trainees).
  useEffect(() => {
    if (!isOwner) return
    supabase.rpc('list_coaches').then(({ data, error }) => {
      if (error) return console.error(error)
      // A frozen coach can't take new trainees.
      setCoaches((data || []).filter((c) => !c.frozen))
    })
  }, [isOwner])

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
    // The chart only draws the last six months in the latest unit, so judge
    // "enough points" on that series, not on everything ever logged.
    const weightSeries = lastWeight
      ? data.weights
          .filter((w) => w.date >= shiftDay(today, -182) && w.unit === lastWeight.unit)
          .map((w) => ({ ...w, weight: Number(w.weight), label: shortDate(lang, w.date) }))
      : []
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
      adh: adherence(counts, planned, data.profile.created_at, today),
      lastSession: data.sessions[0]?.date || null,
      toReview: data.sessions.filter((s) => needsReview(s, today)),
      lastWeight,
      weightSeries,
      baselineDays: baseline ? daysSince(baseline.date, today) - daysSince(lastWeight.date, today) : null,
      weightChange: baseline ? Math.round((lastWeight.weight - baseline.weight) * 10) / 10 : null,
      food: { days: days.length, kcal: avg('kcal'), protein: avg('protein') },
    }
  }, [data, today, lang])

  if (!isAdmin) return null
  if (loadError && !data) return <LoadError onRetry={() => setReload((r) => r + 1)} />
  if (!data) return <PageLoader />

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

  async function makeCoach() {
    const name = p.full_name || p.email
    if (!(await confirm({ title: t('people.makeCoachTitle', { name }), body: t('people.makeCoachBody'), confirmLabel: t('people.coachOff') }))) return
    const { error } = await supabase.rpc('set_coach', { p_person: p.id, p_on: true })
    if (error) {
      console.error(error)
      toast(t('people.coachError'), 'error')
      return
    }
    toast(t('people.coachMade', { name }))
    navigate('/people')
  }

  // A coach hands one of their trainees back to the owner.
  async function returnToOwner() {
    const name = p.full_name || p.email
    if (!(await confirm({ title: t('people.returnTitle', { name, owner: ownerName }), body: t('people.returnBody', { owner: ownerName }), confirmLabel: t('people.returnConfirm'), danger: true }))) return
    const { error } = await supabase.rpc('return_to_owner', { p_person: p.id })
    if (error) {
      console.error(error)
      toast(t('people.coachChangeError'), 'error')
      return
    }
    toast(t('people.returned', { name, owner: ownerName }))
    navigate('/people')
  }

  // Remove a trainee from the app, or let them back in.
  async function setRemoved(removed) {
    const name = p.full_name || p.email
    const ok = await confirm(
      removed
        ? { title: t('people.removeAppTitle', { name }), body: t('people.removeAppBody', { name }), confirmLabel: t('people.removeApp'), danger: true }
        : { title: t('people.restoreTitle', { name }), body: t('people.restoreBody', { name }), confirmLabel: t('people.restore') }
    )
    if (!ok) return
    const { error } = await supabase.rpc('set_removed', { p_person: p.id, p_removed: removed })
    if (error) {
      console.error(error)
      toast(t(/COACH_LIMIT_REACHED/.test(error.message || '') ? 'people.limitReachedRestore' : 'people.coachChangeError'), 'error')
      return
    }
    toast(t(removed ? 'people.removedApp' : 'people.restored', { name }))
    setData((d) => ({ ...d, profile: { ...d.profile, removed_at: removed ? new Date().toISOString() : null } }))
  }

  async function changeCoach(coachId) {
    const name = p.full_name || p.email
    const target = coachId === myProfile?.id ? null : coaches.find((c) => c.id === coachId)
    const coachName = target ? target.name || target.email : myProfile?.full_name || me?.email
    if (target && !(await confirm({ title: t('people.moveTitle', { name, coach: coachName }), body: t('people.moveBody'), confirmLabel: t('people.moveConfirm'), danger: true }))) return
    const { error } = await supabase.rpc('assign_coach', { p_person: p.id, p_coach: coachId })
    if (error) {
      console.error(error)
      toast(t(/COACH_LIMIT_REACHED/.test(error.message || '') ? 'people.limitReachedMove' : 'people.coachChangeError'), 'error')
      return
    }
    toast(t('people.moved', { name, coach: coachName }))
    if (target) navigate('/people')
    else setData((d) => ({ ...d, profile: { ...d.profile, coach_id: coachId } }))
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
          ? `\u2066${derived.weightChange > 0 ? '+' : ''}${derived.weightChange}\u2069 ${t('person.vsBaseline')(derived.baselineDays)}`
          : null,
    },
  ]

  const consent = data.consent
  const recent = data.sessions.slice(0, 8)

  return (
    <div className="flex flex-col gap-5">
      <div className="lg:flex lg:items-end lg:justify-between lg:gap-6">
        <div className="min-w-0">
          <Link to="/people" className="eyebrow inline-flex items-center gap-1 mb-2">
            <BackChevron size={14} /> {t('people.title')}
          </Link>
          <h1 className="text-3xl break-words">{name}</h1>
          {p.removed_at && <p className="text-irontext text-sm mt-1">{t('people.removedNotice')}</p>}
          <p className="text-chalkdim text-sm mt-0.5 truncate" dir="ltr" style={{ textAlign: 'start' }}>
            {p.email}
          </p>
        </div>
        <div className="flex gap-2 mt-4 lg:mt-0 flex-wrap shrink-0">
          <Button variant="brass" onClick={() => openAccount('/')}>
            {t('person.openAccount')} <ForwardArrow size={15} />
          </Button>
          {!(p.is_admin || p.is_coach) && (
            <Button variant="ghost" onClick={toggleNutrition} aria-pressed={!!p.nutrition_enabled}>
              <Apple size={15} className={p.nutrition_enabled ? 'text-good' : ''} />
              {p.nutrition_enabled ? t('people.nutritionOn') : t('people.nutritionOff')}
            </Button>
          )}
          {isOwner && !p.is_admin && (
            <Button variant="ghost" onClick={makeCoach}>
              <GraduationCap size={15} />
              {t('people.coachOff')}
            </Button>
          )}
          {isCoach && !p.is_admin && !p.is_coach && p.id !== myProfile?.id && 'removed_at' in p && (
            <Button variant="ghost" onClick={() => setRemoved(!p.removed_at)}>
              {p.removed_at ? <UserCheck size={15} /> : <UserX size={15} />}
              {p.removed_at ? t('people.restore') : t('people.removeApp')}
            </Button>
          )}
          {isCoach && !isOwner && ownerName && !p.is_admin && !p.is_coach && p.id !== myProfile?.id && (
            <Button variant="ghost" onClick={returnToOwner}>
              <Undo2 size={15} />
              {t('people.returnButton', { owner: ownerName })}
            </Button>
          )}
          {isOwner && !p.is_admin && (
            <Field label={t('people.coachOf')}>
              <select value={p.coach_id || myProfile?.id || ''} onChange={(e) => changeCoach(e.target.value)}>
                <option value={myProfile?.id}>{myProfile?.full_name || me?.email}</option>
                {coaches.map((c) => (
                  <option key={c.id} value={c.id}>{c.name || c.email}</option>
                ))}
              </select>
            </Field>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="card px-4 py-3">
            <div className="eyebrow">{s.label}</div>
            <div className="num text-2xl text-chalk mt-0.5">{s.value}</div>
            {s.sub && <div className="text-xs text-chalkdim num mt-0.5">{s.sub}</div>}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-3 lg:items-start">
        <div className="flex flex-col gap-5 lg:col-span-2">
          {data.notes.filter((n) => n.pinned).map((n) => (
            <div key={n.id} className="card px-4 py-3 flex gap-2 items-start">
              <Pin size={14} className="text-accent shrink-0 mt-0.5" />
              <p className="text-sm whitespace-pre-wrap">{n.body}</p>
            </div>
          ))}

          {messagesOn && !data.traineeSettings?.messages_off && (
            <Section title={t('messages.title')} hint={t('messages.coachHint')}>
              <MessageThread traineeId={p.id} viewerId={me.uid} side="coach" readOnlyNote={p.removed_at ? t('people.removedNoMessages') : null} />
            </Section>
          )}

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
            <div
              className="h-36 lg:h-56 -mx-1"
              role="img"
              aria-label={t('person.consistencyAria')(derived.weeks.length, derived.weeks.reduce((a, w) => a + w.count, 0), derived.thisWeek)}
            >
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
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={28}>
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
              {derived.weightSeries.length < 2 ? (
                <p className="text-sm text-chalkdim">{t('person.weightFew')}</p>
              ) : (
              <div
                className="h-36 lg:h-56 -mx-1"
                role="img"
                aria-label={t('person.weightAria')(derived.weightSeries[0].weight, derived.weightSeries.at(-1).weight, derived.lastWeight.unit, derived.weightSeries.length)}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={derived.weightSeries}>
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
              )}
            </Section>
          )}

          <MeasurementCharts entries={data.measurements} types={data.measurementSetup.types} today={today} t={t} lang={lang} />

          {data.checkins?.length > 0 && <Checkins list={data.checkins} t={t} lang={lang} />}

          {!(p.is_admin || p.is_coach) && (
            <Section title={t('photos.title')}>
              <ProgressPhotos uid={p.id} mode="coach" />
            </Section>
          )}

          {!(p.is_admin || p.is_coach) && (
            <Section
              title={t('person.routines')}
              hint={data.routines.length > 0 ? t('person.routinesHint') : t('person.noRoutinesYet')}
              action={<GiveRoutine personId={p.id} t={t} onGiven={() => setReload((r) => r + 1)} />}
            >
              {data.routines.length > 0 && (
                <RoutineListView routines={data.routines} t={t} onEdit={(r) => openAccount(`/routines/${r.id}/edit`)} />
              )}
            </Section>
          )}

          {recent.length > 0 && (
            <Section title={t('person.recentSessions')}>
              <SessionList sessions={recent} lang={lang} t={t} today={today} onOpen={(s) => openAccount(`/history/${s.id}`)} showReviewed />
            </Section>
          )}
        </div>
        <div className="flex flex-col gap-5">
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

          {!(p.is_admin || p.is_coach) && (
            <TrackingSettings
              key={`tracking-${p.id}`}
              person={p}
              name={name}
              setup={data.measurementSetup}
              coachId={myProfile?.id}
              t={t}
              lang={lang}
              confirm={confirm}
              toast={toast}
              onProfile={(patch) => setData((d) => ({ ...d, profile: { ...d.profile, ...patch } }))}
              onSetup={(measurementSetup) => setData((d) => ({ ...d, measurementSetup }))}
              traineeSettings={data.traineeSettings}
              onTraineeSettings={(traineeSettings) => setData((d) => ({ ...d, traineeSettings }))}
            />
          )}

          <GoalForm
            key={`goal-${p.id}`}
            traineeId={p.id}
            goal={data.goal}
            scheduled={derived.scheduled}
            checkinDays={coachSettings?.settings.checkin_days ?? 7}
            today={today}
            t={t}
            lang={lang}
            onSaved={(goal) => setData((d) => ({ ...d, goal }))}
            onError={() => toast(t('feedback.saveFailed'), 'error')}
          />

          <Notes
            key={`notes-${p.id}`}
            traineeId={p.id}
            notes={data.notes}
            t={t}
            lang={lang}
            confirm={confirm}
            onChange={(notes) => setData((d) => ({ ...d, notes }))}
            onError={() => toast(t('feedback.saveFailed'), 'error')}
          />
        </div>
      </div>

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

// Give this trainee a copy of one of the coach's own routines, from their
// page, without switching into their account. Uses the same copy as
// Routines → "Copy to…", which also brings the exercises across.
function GiveRoutine({ personId, t, onGiven }) {
  const { user } = useAuth()
  const { toast } = useFeedback()
  const [open, setOpen] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [given, setGiven] = useState([])
  return (
    <>
      <Button type="button" variant="ghost" className="shrink-0" onClick={() => setOpen(true)}>
        <Plus size={16} /> {t('person.giveRoutine')}
      </Button>
      {open && (
        <GiveRoutineSheet
          uid={user?.uid}
          t={t}
          busyId={busyId}
          given={given}
          onClose={() => setOpen(false)}
          onPick={async (r) => {
            setBusyId(r.id)
            try {
              await copyRoutineToUser(personId, r)
              setGiven((g) => [...g, r.id])
              toast(t('person.routineGiven', { name: r.name }))
              onGiven()
            } catch (err) {
              console.error(err)
              toast(t('feedback.saveFailed'), 'error')
            } finally {
              setBusyId(null)
            }
          }}
        />
      )}
    </>
  )
}

function GiveRoutineSheet({ uid, t, busyId, given, onClose, onPick }) {
  useScrollLock(true)
  const [routines, loading, refresh, loadError] = useCollection(uid, 'routines', 'created_at', 'desc')
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('person.giveRoutine')}
      className="fixed inset-0 bg-ink/80 backdrop-blur-sm z-30 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="card p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl mb-1">{t('person.giveRoutine')}</h2>
        <p className="text-chalkdim text-sm mb-4">{t('person.giveRoutineHint')}</p>
        <div className="flex flex-col gap-1 max-h-72 overflow-y-auto">
          {loading && <p className="text-chalkdim text-sm py-2">{t('common.loading')}</p>}
          {!loading && loadError && routines.length === 0 && <LoadError onRetry={refresh} />}
          {!loading && !loadError && routines.length === 0 && <p className="text-chalkdim text-sm py-2">{t('person.noOwnRoutines')}</p>}
          {routines.map((r) => {
            const done = given.includes(r.id)
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => onPick(r)}
                disabled={done || busyId != null}
                className="flex items-center justify-between gap-2 px-3 min-h-[48px] rounded-[12px] hover:bg-surface2 text-start disabled:opacity-60"
              >
                <span className="truncate min-w-0">{r.name}</span>
                <span className="text-xs text-brass shrink-0 inline-flex items-center gap-1">
                  {done ? (
                    <>
                      <Check size={14} /> {t('routines.copiedLabel')}
                    </>
                  ) : busyId === r.id ? (
                    t('common.saving')
                  ) : (
                    t('routines.copyHereLabel')
                  )}
                </span>
              </button>
            )
          })}
        </div>
        <div className="flex justify-end mt-4 pt-4 border-t border-line">
          <Button variant="ghost" onClick={onClose}>
            {t('common.done')}
          </Button>
        </div>
      </div>
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
              <span className="block truncate text-sm">{sessionTitle(s, t)}</span>
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

// The trainee's routines, read-only: tap one to see every exercise and its
// target right here, without opening their account or the editor.
function RoutineListView({ routines, t, onEdit }) {
  const [open, setOpen] = useState(null)
  return (
    <ul className="flex flex-col -my-1">
      {routines.map((r) => {
        const isOpen = open === r.id
        return (
          <li key={r.id} className="border-t border-white/[0.06] first:border-t-0">
            <button
              onClick={() => setOpen(isOpen ? null : r.id)}
              aria-expanded={isOpen}
              className="press-row w-full flex items-center gap-3 py-2 text-start min-h-[44px]"
            >
              <span className="flex-1 min-w-0">
                <span className="block truncate text-sm">{r.name}</span>
                <span className="block text-xs text-chalkdim">
                  {r.exercises?.length || 0} {t('routines.exercisesCount')}
                </span>
              </span>
              <ChevronDown size={15} className={`text-chalkdim shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
              <div className="pb-3">
                <RoutineExercises routine={r} nameOf={(it) => it.name} t={t} compact />
                <button onClick={() => onEdit(r)} className="mt-1 text-xs text-chalkdim hover:text-chalk inline-flex items-center gap-1 min-h-9">
                  <Pencil size={13} /> {t('person.editRoutine')}
                </button>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function GoalForm({ traineeId, goal, scheduled, checkinDays = 7, today, t, lang, onSaved, onError }) {
  const [text, setText] = useState(goal?.goal || '')
  const [target, setTarget] = useState(goal?.target_weight ?? '')
  const [perWeek, setPerWeek] = useState(goal?.sessions_per_week ?? '')
  const [checkin, setCheckin] = useState(goal?.next_checkin || '')
  const [birthday, setBirthday] = useState(goal?.birthday || '')
  const [saving, setSaving] = useState(false)

  const dirty =
    text !== (goal?.goal || '') ||
    String(target) !== String(goal?.target_weight ?? '') ||
    String(perWeek) !== String(goal?.sessions_per_week ?? '') ||
    checkin !== (goal?.next_checkin || '') ||
    birthday !== (goal?.birthday || '')

  async function save(overrides = {}) {
    setSaving(true)
    try {
      const num = (v) => (v === '' || v == null ? null : Number(v))
      const row = await saveCoachGoal(traineeId, {
        goal: text.trim() || null,
        target_weight: num(target),
        sessions_per_week: perWeek === '' ? null : Math.min(14, Math.max(1, Math.round(Number(perWeek)))),
        next_checkin: checkin || null,
        birthday: birthday || null,
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
            <input type="number" inputMode="numeric" min="1" max="14" step="1" value={perWeek} onChange={(e) => setPerWeek(e.target.value)} />
          </Field>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('person.nextCheckin')}>
          <input type="date" value={checkin} onChange={(e) => setCheckin(e.target.value)} className={due ? 'text-accent' : ''} />
        </Field>
        <Field label={t('person.birthday')}>
          <input type="date" value={birthday} max={today} onChange={(e) => setBirthday(e.target.value)} />
        </Field>
      </div>
      <div className="flex gap-2 flex-wrap">
        {dirty && (
          <Button variant="brass" onClick={() => save()} disabled={saving}>
            {t('common.save')}
          </Button>
        )}
        {due && !dirty && (
          <Button variant="ghost" onClick={() => save({ next_checkin: shiftDay(today, checkinDays) })} disabled={saving}>
            {checkinDays === 7 ? t('person.checkinDone') : t('person.checkinDoneDays', { n: checkinDays })}
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

// One small chart per measurement with at least two entries in the last six
// months, in the unit of the latest entry.
function MeasurementCharts({ entries, types, today, t, lang }) {
  const since = shiftDay(today, -182)
  const kinds = [...new Set(entries.map((e) => e.kind))].filter((k) => typeFor(k, types))
  return kinds.map((k) => {
    const list = entries.filter((e) => e.kind === k && e.date >= since)
    if (list.length < 2) return null
    const unit = list.at(-1).unit || ''
    const series = list.map((e) => ({ v: round1(convert(e.value, e.unit, unit)), label: shortDate(lang, e.date) }))
    const name = measurementLabel(k, types, t, lang)
    return (
      <Section key={k} title={<bdi>{name}</bdi>}>
        <div className="h-36 lg:h-56 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series}>
              <XAxis dataKey="label" stroke={CHALKDIM} fontSize={10} tickLine={false} axisLine={false} minTickGap={24} reversed={lang === 'he'} />
              <YAxis hide domain={[(min) => Math.floor(min - 1), (max) => Math.ceil(max + 1)]} />
              <Tooltip contentStyle={{ background: SURFACE, border: 0, borderRadius: 12, fontSize: 13 }} labelStyle={{ color: CHALK }} formatter={(v) => [`${v}${unit}`, name]} />
              <Line type="monotone" dataKey="v" stroke={ACCENT} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Section>
    )
  })
}

// What this trainee logs on their body page (built-in or the coach's own
// measurements), the coach's default list, and the quiet-alert days.
function TrackingSettings({ person, name, setup, coachId, t, lang, confirm, toast, onProfile, onSetup, traineeSettings, onTraineeSettings }) {
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [labelEn, setLabelEn] = useState('')
  const [labelHe, setLabelHe] = useState('')
  const [unitKind, setUnitKind] = useState('length')
  const [quiet, setQuiet] = useState(String(person.inactivity_alert_days ?? 5))

  const types = setup.types
  const kinds = setup.kinds
  const options = [
    ...BUILT_IN.map((b) => b.key),
    ...types.filter((ct) => !ct.archived || kinds.includes(customKey(ct.id))).map((ct) => customKey(ct.id)),
  ]
  const sameAsDefault = kinds.length === setup.defaultKinds.length && kinds.every((k) => setup.defaultKinds.includes(k))

  async function run(fn) {
    setBusy(true)
    try {
      await fn()
      onSetup(await fetchMeasurementSetup(person.id))
    } catch (e) {
      console.error(e)
      toast(t('feedback.saveFailed'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const toggle = (k) => run(() => setPersonMeasurements(person.id, kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k]))

  async function addType(e) {
    e.preventDefault()
    if (!labelEn.trim() && !labelHe.trim()) return
    await run(async () => {
      const row = await addMeasurementType(coachId, { labelEn, labelHe, unitKind })
      await setPersonMeasurements(person.id, [...kinds, customKey(row.id)])
      setLabelEn('')
      setLabelHe('')
      setUnitKind('length')
      setAdding(false)
    })
  }

  async function archive(k) {
    const ty = types.find((ct) => customKey(ct.id) === k)
    const label = measurementLabel(k, types, t, lang)
    if (!ty || !(await confirm({ title: t('measure.archiveConfirm', { name: label }), body: t('measure.archiveBody'), confirmLabel: t('common.delete'), danger: true }))) return
    run(async () => {
      await setMeasurementTypeArchived(ty.id, true)
      await setPersonMeasurements(person.id, kinds.filter((x) => x !== k))
    })
  }

  async function toggleFeature(key) {
    const next = { ...(traineeSettings || {}), [key]: !traineeSettings?.[key] }
    const { error } = await supabase
      .from('trainee_settings')
      .upsert({ user_id: person.id, [key]: next[key], updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    if (error) {
      console.error(error)
      toast(t('feedback.saveFailed'), 'error')
      return
    }
    onTraineeSettings(next)
  }

  async function saveReminder(patch) {
    const next = { ...(traineeSettings || {}), ...patch }
    const { error } = await supabase
      .from('trainee_settings')
      .upsert({ user_id: person.id, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    if (error) {
      console.error(error)
      toast(error.code === 'PGRST204' ? t('measure.reminderNotReady') : t('feedback.saveFailed'), 'error')
      return
    }
    onTraineeSettings(next)
  }

  async function saveQuiet() {
    const n = Math.min(60, Math.max(1, Math.round(Number(quiet)) || 5))
    setQuiet(String(n))
    if (n === (person.inactivity_alert_days ?? 5)) return
    const { error } = await supabase.from('profiles').update({ inactivity_alert_days: n }).eq('id', person.id)
    if (error) {
      console.error(error)
      toast(t('feedback.saveFailed'), 'error')
      return
    }
    onProfile({ inactivity_alert_days: n })
  }

  return (
    <Section title={t('measure.settingsTitle')} hint={t('measure.settingsHint', { name })}>
      <div className="flex items-center gap-2 flex-wrap text-sm">
        <span>{t('measure.quietDays')}</span>
        <input
          type="number"
          inputMode="numeric"
          min="1"
          max="60"
          step="1"
          value={quiet}
          onChange={(e) => setQuiet(e.target.value)}
          onBlur={saveQuiet}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="w-16 text-center"
          aria-label={`${t('measure.quietDays')} ${t('measure.quietDaysUnit')}`}
        />
        <span>{t('measure.quietDaysUnit')}</span>
      </div>
      <p className="text-xs text-chalkdim -mt-1">{t('measure.quietDaysHint')}</p>

      {traineeSettings && (
        <div className="border-t border-line pt-3 flex flex-col gap-1">
          <span className="eyebrow">{t('measure.featuresLabel')}</span>
          {[
            ['messages_off', 'featureMessages'],
            ['weigh_prompt_off', 'featureWeighCard'],
          ].map(([key, label]) => (
            <label key={key} className="flex items-center gap-3 min-h-10 cursor-pointer text-sm">
              <input type="checkbox" checked={!traineeSettings[key]} onChange={() => toggleFeature(key)} className="w-5 h-5" />
              {t(`measure.${label}`)}
            </label>
          ))}
          <ReminderControl settings={traineeSettings} lang={lang} t={t} onSave={saveReminder} />
        </div>
      )}

      <div className="border-t border-line pt-3 flex flex-col gap-2">
        <span className="eyebrow">{t('measure.listLabel')}</span>
        {!setup.available ? (
          <p className="text-xs text-chalkdim">{t('measure.notReady')}</p>
        ) : (
          <>
            <div className="flex gap-2 flex-wrap">
              {options.map((k) => {
                const on = kinds.includes(k)
                const custom = !typeFor(k, types)?.builtIn
                return (
                  <span key={k} className="inline-flex items-center">
                    <button
                      type="button"
                      disabled={busy}
                      aria-pressed={on}
                      onClick={() => toggle(k)}
                      className={`min-h-9 px-3 rounded-full text-sm border inline-flex items-center gap-1 ${on ? 'bg-accent text-ink border-accent' : 'border-line text-chalkdim hover:text-chalk'}`}
                    >
                      {on && <Check size={13} />}
                      <bdi>{measurementLabel(k, types, t, lang)}</bdi>
                    </button>
                    {custom && (
                      <button type="button" disabled={busy} onClick={() => archive(k)} className="hit text-chalkdim p-1" aria-label={t('measure.archive', { name: measurementLabel(k, types, t, lang) })}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </span>
                )
              })}
              {!adding && (
                <button type="button" onClick={() => setAdding(true)} className="min-h-9 px-3 rounded-full text-sm border border-dashed border-line text-chalkdim hover:text-chalk inline-flex items-center gap-1">
                  <Plus size={13} /> {t('measure.addOwn')}
                </button>
              )}
            </div>
            {kinds.length === 0 && <p className="text-xs text-chalkdim">{t('measure.noneOn')}</p>}

            {adding && (
              <form onSubmit={addType} className="flex flex-col gap-2 rounded-[14px] border border-line p-3">
                <div className="grid grid-cols-2 gap-2">
                  <Field label={t('measure.nameEn')}>
                    <input value={labelEn} onChange={(e) => setLabelEn(e.target.value)} maxLength={40} dir="ltr" />
                  </Field>
                  <Field label={t('measure.nameHe')}>
                    <input value={labelHe} onChange={(e) => setLabelHe(e.target.value)} maxLength={40} dir="rtl" />
                  </Field>
                </div>
                <p className="text-xs text-chalkdim">{t('measure.nameHint')}</p>
                <Field label={t('measure.unitKind')}>
                  <select value={unitKind} onChange={(e) => setUnitKind(e.target.value)}>
                    <option value="length">{t('measure.unitLength')}</option>
                    <option value="percent">{t('measure.unitPercent')}</option>
                    <option value="number">{t('measure.unitNumber')}</option>
                  </select>
                </Field>
                <div className="flex gap-2">
                  <Button type="submit" variant="brass" disabled={busy || (!labelEn.trim() && !labelHe.trim())}>
                    {t('common.add')}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
                    {t('common.cancel')}
                  </Button>
                </div>
              </form>
            )}

            <p className="text-xs text-chalkdim">{setup.own ? t('measure.ownList') : t('measure.followsDefault')}</p>
            <div className="flex gap-2 flex-wrap">
              {!sameAsDefault && (
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => run(async () => {
                    await setDefaultMeasurements(coachId, kinds)
                    toast(t('measure.defaultSaved'))
                  })}
                >
                  {t('measure.makeDefault')}
                </Button>
              )}
              {setup.own && (
                <Button variant="ghost" disabled={busy} onClick={() => run(() => clearPersonMeasurements(person.id))}>
                  {t('measure.useDefault')}
                </Button>
              )}
            </div>
            {!sameAsDefault && <p className="text-xs text-chalkdim">{t('measure.makeDefaultHint')}</p>}
          </>
        )}
      </div>
    </Section>
  )
}

// The trainee's weekly check-in answers, newest week first; the latest is
// open, older weeks fold. Question text comes from the copy saved with the
// answers, so later edits to the questions don't change old answers.
function Checkins({ list, t, lang }) {
  const [openWeek, setOpenWeek] = useState(list[0]?.week_start)
  return (
    <Section title={t('checkin.coachTitle')} hint={t('checkin.coachHint')}>
      <ul className="flex flex-col divide-y divide-line">
        {list.map((c) => {
          const open = openWeek === c.week_start
          const qs = (c.questions || []).filter((q) => c.answers?.[q.id] !== undefined)
          return (
            <li key={c.id} className="py-2">
              <button type="button" onClick={() => setOpenWeek(open ? null : c.week_start)} aria-expanded={open} className="w-full flex items-center justify-between gap-2 min-h-9 text-start">
                <span className="text-sm">{t('checkin.weekOf', { date: fmtDate(lang, new Date(c.week_start + 'T00:00:00'), { month: 'short', day: 'numeric' }) })}</span>
                <ChevronDown size={15} className={`text-chalkdim transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
              {open && (
                <dl className="flex flex-col gap-2 mt-1">
                  {qs.map((q) => (
                    <div key={q.id}>
                      <dt className="text-xs text-chalkdim" dir="auto">{questionText(q, lang)}</dt>
                      <dd className="text-sm text-chalk whitespace-pre-wrap break-words" dir="auto">
                        {q.type === 'scale' ? <span className="num" dir="ltr">{c.answers[q.id]}/5</span> : String(c.answers[q.id])}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

// The trainee's daily workout reminder, set by the coach: a time and
// weekdays that win over what the trainee picked on their phone. Empty
// keeps the trainee's own choice.
function ReminderControl({ settings, lang, t, onSave }) {
  const time = settings?.remind_time ? String(settings.remind_time).slice(0, 5) : ''
  const days = Array.isArray(settings?.remind_days) ? settings.remind_days.map(Number) : []
  const dayNames = [0, 1, 2, 3, 4, 5, 6].map((d) =>
    new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-US', { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(Date.UTC(2023, 0, 1 + d))),
  )
  return (
    <div className="flex flex-col gap-2 mt-2">
      <div className="flex items-center gap-2 flex-wrap text-sm">
        <span>{t('measure.reminderLabel')}</span>
        <input
          type="time"
          value={time}
          onChange={(e) => onSave({ remind_time: e.target.value || null, ...(e.target.value ? {} : { remind_days: null }) })}
          className="w-28"
          aria-label={t('measure.reminderLabel')}
        />
        {time && (
          <button type="button" onClick={() => onSave({ remind_time: null, remind_days: null })} className="text-xs text-chalkdim underline min-h-9">
            {t('measure.reminderClear')}
          </button>
        )}
      </div>
      {time && (
        <div className="flex gap-1 flex-wrap" aria-label={t('measure.reminderDays')}>
          {dayNames.map((n, d) => {
            const on = days.length === 0 || days.includes(d)
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  const base = days.length ? days : [0, 1, 2, 3, 4, 5, 6]
                  const next = on ? base.filter((x) => x !== d) : [...base, d].sort()
                  if (next.length) onSave({ remind_days: next.length === 7 ? null : next })
                }}
                className={`w-9 h-9 rounded-full text-xs ${on ? 'bg-accent text-ink' : 'bg-surface2 text-chalkdim'}`}
              >
                {n}
              </button>
            )
          })}
        </div>
      )}
      <p className="text-xs text-chalkdim">{time ? t('measure.reminderSetHint') : t('measure.reminderHint')}</p>
    </div>
  )
}

