import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Play, Plus, Check, Circle, MessageSquareText } from 'lucide-react'
import { InfoTip } from './InfoTip.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useAdmin } from '../context/AdminContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { fmtDate, toLocalISODate } from '../lib/dates.js'
import { useFeedback } from '../context/FeedbackContext.jsx'
import { useCollection, hasUnreadFeedback } from '../lib/db.js'
import { isFreestyleSession, sessionTitle, entryName, exerciseMap } from '../lib/names.js'
import { workingSets } from '../lib/warmup.js'
import { listDrafts, clearDraft } from '../lib/draft.js'
import { Card, LoadError, FeedbackDot } from './ui.jsx'
import { ForwardChevron } from './DirectionalIcon.jsx'
import WeeklySchedule from './WeeklySchedule.jsx'

// Was hard-coded English ("5m ago") even with the app in Hebrew.
function timeAgo(ts, t) {
  const mins = Math.max(1, Math.round((Date.now() - ts) / 60000))
  if (mins < 60) return t('dashboard.minutesAgo', { n: mins })
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return t('dashboard.hoursAgo', { n: hrs })
  return t('dashboard.daysAgo', { n: Math.round(hrs / 24) })
}

function greetingKey(hour) {
  if (hour < 5) return 'dashboard.greetingNight'
  if (hour < 12) return 'dashboard.greetingMorning'
  if (hour < 17) return 'dashboard.greetingAfternoon'
  if (hour < 22) return 'dashboard.greetingEvening'
  return 'dashboard.greetingNight'
}

const numLocale = (lang) => (lang === 'he' ? 'he-IL' : 'en-US')

// Volume for strength sessions, distance for cardio; null when there is
// nothing meaningful to show (e.g. bodyweight-only or timed holds).
function sessionLoad(s, lang, t) {
  let volume = 0
  let distance = 0
  let vUnit = 'kg'
  let dUnit = 'km'
  for (const e of s.entries || []) {
    for (const set of workingSets(e.sets || [])) {
      if (e.category === 'cardio') {
        const d = Number(set.distance)
        if (d > 0) {
          distance += d
          if (e.unit) dUnit = e.unit
        }
      } else if (!e.timed) {
        const v = (Number(set.weight) || 0) * (Number(set.reps) || 0)
        if (v > 0) {
          volume += v
          vUnit = set.unit || e.unit || vUnit
        }
      }
    }
  }
  const unitLabel = (u) => (u === 'kg' ? t('dashboard.unitKg') : u === 'km' ? t('dashboard.unitKm') : u)
  if (volume > 0) return `${Math.round(volume).toLocaleString(numLocale(lang))} ${unitLabel(vUnit)}`
  if (distance > 0) return `${Number(distance.toFixed(1)).toLocaleString(numLocale(lang))} ${unitLabel(dUnit)}`
  return null
}

function shortDate(lang, iso) {
  return fmtDate(lang, new Date(iso + 'T00:00:00'), { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function Dashboard() {
  const { user } = useAuth()
  const { actingAs, effectiveUid, effectiveName } = useAdmin()
  const { t, lang } = useLanguage()
  const { confirm } = useFeedback()
  const [exercises, exercisesLoading, refreshExercises, exercisesError] = useCollection(effectiveUid, 'exercises', 'name', 'asc')
  const [routines, routinesLoading, refreshRoutines, routinesError] = useCollection(effectiveUid, 'routines', 'created_at', 'desc')
  const [sessions, sessionsLoading, refreshSessions, sessionsError] = useCollection(effectiveUid, 'sessions', 'date', 'desc')
  const [schedule, scheduleLoading, refreshSchedule, scheduleError] = useCollection(effectiveUid, 'weekly_schedule', 'day_of_week', 'asc')
  const exById = useMemo(() => exerciseMap(exercises), [exercises])
  // Lets the rest-day card open today's panel inside WeeklySchedule.
  const [panelReq, setPanelReq] = useState(null)
  // A failed load (patchy connection) must not read as "nothing here yet":
  // no onboarding checklist, no zero counts, just a retry.
  const loadFailed = !!(exercisesError || routinesError || sessionsError || scheduleError)
  const retryAll = () => {
    refreshExercises()
    refreshRoutines()
    refreshSessions()
    refreshSchedule()
  }

  const steps = useMemo(
    () => [
      {
        done: exercises.length > 0,
        label: t('dashboard.stepAddExercise'),
        body: t('dashboard.stepAddExerciseBody'),
        to: '/exercises',
      },
      {
        done: routines.length > 0,
        label: t('dashboard.stepBuildRoutine'),
        body: t('dashboard.stepBuildRoutineBody'),
        to: routines.length > 0 ? '/routines' : '/routines/new',
      },
      {
        done: sessions.length > 0,
        label: t('dashboard.stepLogSession'),
        body: t('dashboard.stepLogSessionBody'),
        to: routines.length > 0 ? `/workout/${routines[0].id}` : '/workout/freestyle',
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [exercises.length, routines, sessions.length, t],
  )
  const allDone = steps.every((s) => s.done)
  const showChecklist = !sessionsLoading && !routinesLoading && !exercisesLoading && !loadFailed && !allDone

  // Every unfinished workout, not just the most recent one — a day can
  // hold three routines, and a half-done session shouldn't be hidden
  // just because another was started after it.
  const [drafts, setDrafts] = useState([])
  useEffect(() => {
    const refresh = () => setDrafts(listDrafts(effectiveUid))
    refresh()
    // Coming back to the app (another tab, or the phone unlocked) can mean
    // a workout was saved or finished meanwhile — re-read instead of
    // showing a stale "In progress" card.
    const onVisible = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', refresh)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', refresh)
    }
  }, [effectiveUid])

  // One stray tap used to throw away a half-logged workout with no way back.
  async function discardDraft(routineKey) {
    const ok = await confirm({
      title: t('workout.discardTitle'),
      body: t('workout.discardBody'),
      confirmLabel: t('workout.discardConfirm'),
      danger: true,
    })
    if (!ok) return
    clearDraft(effectiveUid, routineKey)
    setDrafts((prev) => prev.filter((d) => d.routineKey !== routineKey))
  }

  const now = new Date()
  const todayDow = now.getDay()
  const todayIso = toLocalISODate(now)

  // Today's planned routines (slot order) that aren't logged yet and have no
  // workout in progress — a draft already shows up in the card above.
  const todayStarts = useMemo(() => {
    if (scheduleLoading || routinesLoading || sessionsLoading) return []
    return schedule
      .filter((s) => s.day_of_week === todayDow && s.routine_id)
      .sort((a, b) => a.slot - b.slot)
      .map((s) => routines.find((r) => r.id === s.routine_id))
      .filter(Boolean)
      .filter((r, i, all) => all.indexOf(r) === i)
      .filter((r) => !sessions.some((x) => x.date === todayIso && x.routine_id === r.id))
      .filter((r) => !drafts.some((d) => d.routineId === r.id))
  }, [schedule, scheduleLoading, routines, routinesLoading, sessions, sessionsLoading, drafts, todayDow, todayIso])

  const plannedToday = schedule
    .filter((s) => s.day_of_week === todayDow && s.routine_id)
    .map((s) => routines.find((r) => r.id === s.routine_id))
    .filter(Boolean)
  const loadedPlan = !scheduleLoading && !routinesLoading && !sessionsLoading && !loadFailed
  const loggedToday = sessions.some((x) => x.date === todayIso)
  const recent = sessions.slice(0, 3)
  // New coach feedback, newest workout first. Only the trainee sees this.
  const unreadFeedback = actingAs ? [] : sessions.filter(hasUnreadFeedback)
  const firstName = (user.displayName || user.email || '').split(/[\s@]/)[0]

  const restLink = (label) => (
    <button
      type="button"
      onClick={() => setPanelReq({ day: todayDow, n: Date.now() })}
      className="press self-start text-[14px] text-chalk underline underline-offset-4 decoration-white/20 min-h-11 pe-2"
    >
      {label}
    </button>
  )

  return (
    <div className="flex flex-col gap-7 pb-[120px]">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[30px] leading-9">
          {actingAs
            ? `${effectiveName}${t('dashboard.trainingLog')}`
            : `${t(greetingKey(now.getHours()))}${firstName ? `, ${firstName}` : ''}`}
        </h1>
        <p className="text-[15px] leading-5 text-chalkdim">
          {fmtDate(lang, now, { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {drafts.map((draft) => (
        <Card key={draft.routineKey} className="!p-5 flex flex-col gap-4">
          <div>
            <div className="eyebrow mb-1 flex items-center gap-1.5 flex-wrap">
              {t('dashboard.inProgress')}
              <InfoTip text={t('dashboard.inProgressTip')} />
            </div>
            <p className="text-[20px] font-semibold leading-tight">{isFreestyleSession(draft) ? t('workout.freestyleSession') : draft.routineName}</p>
            <p className="text-chalkdim text-[13px] mt-1">
              {timeAgo(draft.savedAt, t)} · {draft.entries?.length || 0} {t('dashboard.exerciseLoggedSoFar')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* A link styled as a button, not a button inside a link — the
                nested version is invalid HTML and could need two taps. */}
            <Link
              to={`/workout/${draft.routineId || 'freestyle'}`}
              className="press flex-1 inline-flex items-center justify-center gap-2 rounded-[14px] min-h-[48px] text-[15px] font-semibold bg-accent text-ink hover:bg-accent/90 transition-colors"
            >
              <Play size={15} fill="currentColor" /> {t('dashboard.resume')}
            </Link>
            <button
              type="button"
              onClick={() => discardDraft(draft.routineKey)}
              className="press text-chalkdim text-[14px] hover:text-irontext px-4 min-h-12 rounded-[14px]"
            >
              {t('dashboard.discard')}
            </button>
          </div>
        </Card>
      ))}

      {unreadFeedback.length > 0 && (
        <Link
          to={unreadFeedback.length === 1 ? `/history/${unreadFeedback[0].id}` : '/history'}
          className="press-row flex items-center gap-3 rounded-[18px] bg-accent/10 border border-accent/25 px-4 min-h-[60px] py-3 text-chalk"
        >
          <MessageSquareText size={18} className="text-accent shrink-0" />
          <span className="flex-1 min-w-0 text-[15px] leading-5">
            {unreadFeedback.length === 1
              ? t('dashboard.feedbackBanner')
              : t('dashboard.feedbackBannerMany', { n: unreadFeedback.length })}
          </span>
          <ForwardChevron size={16} className="text-chalkdim/70 shrink-0" />
        </Link>
      )}

      {loadFailed && <LoadError onRetry={retryAll} />}

      <WeeklySchedule
        effectiveUid={effectiveUid}
        routines={routines}
        routinesLoading={routinesLoading}
        sessions={sessions}
        schedule={schedule}
        scheduleLoading={scheduleLoading || (!!scheduleError && schedule.length === 0)}
        refreshSchedule={refreshSchedule}
        openRequest={panelReq}
      />

      {showChecklist && <OnboardingChecklist steps={steps} t={t} />}

      {todayStarts.length > 0 && (
        <TodayHero routine={todayStarts[0]} others={todayStarts.slice(1)} sessions={sessions} exById={exById} lang={lang} t={t} />
      )}

      {loadedPlan && todayStarts.length === 0 && drafts.length === 0 && !showChecklist && (
        <Card className="!p-5 flex flex-col gap-1">
          {plannedToday.length === 0 ? (
            <>
              <h2 className="text-[20px]">{t('dashboard.restDay')}</h2>
              <p className="text-chalkdim text-[14px]">{t('dashboard.restDayToday')}</p>
              {restLink(t('dashboard.trainAnyway'))}
            </>
          ) : (
            <>
              <h2 className="text-[20px]">{loggedToday ? t('dashboard.doneToday') : t('dashboard.restDay')}</h2>
              <p className="text-chalkdim text-[14px]">{plannedToday.map((r) => r.name).join(' + ')}</p>
              {restLink(t('dashboard.startSomethingElse'))}
            </>
          )}
        </Card>
      )}

      {recent.length > 0 && (
        <section className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[17px] leading-[22px]">{t('dashboard.recent')}</h2>
            <Link to="/history" className="text-[14px] text-chalkdim hover:text-chalk px-1 py-2 -my-2">
              {t('dashboard.seeAll')}
            </Link>
          </div>
          <div className="flex flex-col">
            {recent.map((s, i) => {
              const load = sessionLoad(s, lang, t)
              return (
                <Link
                  key={s.id}
                  to={`/history/${s.id}`}
                  className={`press-row flex items-center gap-3 min-h-[60px] ${i < recent.length - 1 ? 'border-b border-white/[0.06]' : ''}`}
                >
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <span className="text-[15px] leading-5 font-medium truncate">
                      {!actingAs && hasUnreadFeedback(s) && <FeedbackDot label={t('history.newFeedback')} />}
                      {sessionTitle(s, t)}
                    </span>
                    <span className="text-[13px] leading-[18px] text-chalkdim truncate">
                      {[shortDate(lang, s.date), s.duration_minutes ? t('workout.durationShort', { min: s.duration_minutes }) : null, load]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </div>
                  <ForwardChevron size={16} className="text-chalkdim/70 shrink-0" />
                </Link>
              )
            })}
          </div>
        </section>
      )}

      <Link
        to="/routines"
        className="press-row flex items-center justify-between gap-3 bg-surface rounded-[20px] px-5 min-h-[56px] hover:bg-surface2 transition-colors"
      >
        <span className="text-[15px]">
          {t('dashboard.navRoutines')}{' '}
          <span className="text-chalkdim">
            · {routines.length} {t('dashboard.routinesCount')}
          </span>
        </span>
        <ForwardChevron size={16} className="text-chalkdim/70 shrink-0" />
      </Link>
    </div>
  )
}

// Today's workout, one tap from the home screen (same route as the play
// button in the day panel). The first pending routine is the hero; any
// others (a day can hold mobility + strength + cardio) are quieter rows.
function TodayHero({ routine, others, sessions, exById, lang, t }) {
  const last = sessions.find((x) => x.routine_id === routine.id)
  const items = routine.exercises || []
  const shown = items.slice(0, 6)
  const parts = [`${items.length} ${t('dashboard.exercisesCount')}`]
  if (last?.duration_minutes) parts.push(t('dashboard.aboutMin', { min: last.duration_minutes }))
  if (last?.date) parts.push(t('dashboard.lastDone', { day: fmtDate(lang, new Date(last.date + 'T00:00:00'), { weekday: 'long' }) }))
  return (
    <section className="bg-surface rounded-[22px] p-5 flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl leading-[30px] tracking-[-0.015em]">{routine.name}</h2>
        <p className="text-[14px] leading-5 text-chalkdim">{parts.join(' · ')}</p>
      </div>
      {shown.length > 0 && (
        <div className="flex flex-col">
          {shown.map((it, i) => (
            <div key={i} className="flex items-center justify-between gap-3 py-3 border-t border-white/[0.07]">
              <span className="text-[15px] leading-5 truncate">{entryName(it, exById, lang)}</span>
              <span className="text-[14px] text-chalkdim whitespace-nowrap">
                {it.targetSets
                  ? `${it.targetSets}${it.targetReps && it.category !== 'cardio' ? ` × ${it.targetReps}${it.timed ? t('dashboard.secShort') : ''}` : ''}`
                  : ''}
              </span>
            </div>
          ))}
          {items.length > shown.length && (
            <div className="py-3 border-t border-white/[0.07] text-[14px] text-chalkdim">
              {t('dashboard.moreExercises', { n: items.length - shown.length })}
            </div>
          )}
        </div>
      )}
      <Link
        to={`/workout/${routine.id}`}
        className="press h-[54px] rounded-[14px] bg-accent text-ink hover:bg-accent/90 transition-colors text-[16px] font-semibold flex items-center justify-center gap-2"
      >
        <Play size={16} fill="currentColor" />
        {t('dashboard.startWorkout')}
      </Link>
      {others.map((r) => (
        <Link
          key={r.id}
          to={`/workout/${r.id}`}
          className="press flex items-center justify-between gap-3 rounded-[14px] px-4 min-h-[48px] bg-surface2 text-chalk hover:bg-surface2/70 text-[15px] font-medium transition-colors"
        >
          <span className="truncate">{t('dashboard.startRoutine', { name: r.name })}</span>
          <Play size={14} fill="currentColor" className="shrink-0" />
        </Link>
      ))}
    </section>
  )
}

function OnboardingChecklist({ steps, t }) {
  const doneCount = steps.filter((s) => s.done).length
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[17px]">{t('dashboard.getSetUp')}</h2>
        <span className="eyebrow">
          {doneCount}/{steps.length}
        </span>
      </div>
      <div className="flex flex-col divide-y divide-white/[0.06]">
        {steps.map((s, i) => (
          <Link
            key={i}
            to={s.to}
            className={`flex items-center gap-3 py-3 ${s.done ? 'opacity-50' : 'hover:bg-surface2 -mx-2 px-2 rounded-[10px]'}`}
          >
            {s.done ? <Check size={18} className="text-chalkdim shrink-0" /> : <Circle size={18} className="text-chalkdim shrink-0" />}
            <div className="min-w-0">
              <p className={s.done ? 'line-through' : ''}>{s.label}</p>
              <p className="text-chalkdim text-xs">{s.body}</p>
            </div>
            {!s.done && <Plus size={16} className="text-chalk ms-auto shrink-0" />}
          </Link>
        ))}
      </div>
    </Card>
  )
}
