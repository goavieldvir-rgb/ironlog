import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Play, Plus, Check, Circle, Clock, Dumbbell, History as HistoryIcon } from 'lucide-react'
import { InfoTip } from './InfoTip.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useAdmin } from '../context/AdminContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { fmtDate, toLocalISODate } from '../lib/dates.js'
import { useFeedback } from '../context/FeedbackContext.jsx'
import { useCollection } from '../lib/db.js'
import { listDrafts, clearDraft } from '../lib/draft.js'
import { Card, LoadError } from './ui.jsx'
import WeeklySchedule from './WeeklySchedule.jsx'

// Was hard-coded English ("5m ago") even with the app in Hebrew.
function timeAgo(ts, t) {
  const mins = Math.max(1, Math.round((Date.now() - ts) / 60000))
  if (mins < 60) return t('dashboard.minutesAgo', { n: mins })
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return t('dashboard.hoursAgo', { n: hrs })
  return t('dashboard.daysAgo', { n: Math.round(hrs / 24) })
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

  // Today's planned routines (slot order) that aren't logged yet and have no
  // workout in progress — a draft already shows up in the card above.
  const todayStarts = useMemo(() => {
    if (scheduleLoading || routinesLoading || sessionsLoading) return []
    const today = new Date()
    const todayIso = toLocalISODate(today)
    return schedule
      .filter((s) => s.day_of_week === today.getDay() && s.routine_id)
      .sort((a, b) => a.slot - b.slot)
      .map((s) => routines.find((r) => r.id === s.routine_id))
      .filter(Boolean)
      .filter((r, i, all) => all.indexOf(r) === i)
      .filter((r) => !sessions.some((x) => x.date === todayIso && x.routine_id === r.id))
      .filter((r) => !drafts.some((d) => d.routineId === r.id))
  }, [schedule, scheduleLoading, routines, routinesLoading, sessions, sessionsLoading, drafts])

  const firstName = (user.displayName || user.email || '').split(/[\s@]/)[0]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="eyebrow mb-1">
          {fmtDate(lang, new Date(), { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
        <h1 className="text-3xl">
          {actingAs
            ? `${effectiveName}${t('dashboard.trainingLog')}`
            : `${t('dashboard.welcomeBack')}${firstName ? `, ${firstName}` : ''}.`}
        </h1>
      </div>

      {drafts.map((draft) => (
        <Card key={draft.routineKey} className="border-brass/60 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <Clock size={18} className="text-brass shrink-0 mt-0.5" />
            <div>
              <div className="eyebrow text-brass mb-0.5 flex items-center gap-1.5 flex-wrap">
                {t('dashboard.inProgress')}
                <InfoTip text={t('dashboard.inProgressTip')} />
              </div>
              <p className="text-lg leading-tight">{draft.routineName}</p>
              <p className="text-chalkdim text-xs mt-0.5">
                {timeAgo(draft.savedAt, t)} · {draft.entries?.length || 0} {t('dashboard.exerciseLoggedSoFar')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button type="button" onClick={() => discardDraft(draft.routineKey)} className="text-chalkdim text-xs hover:text-irontext px-3 min-h-11">
              {t('dashboard.discard')}
            </button>
            {/* A link styled as a button, not a button inside a link — the
                nested version is invalid HTML and could need two taps. */}
            <Link
              to={`/workout/${draft.routineId || 'freestyle'}`}
              className="press inline-flex items-center justify-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-medium bg-brass text-ink hover:bg-brass/90 transition-colors"
            >
              <Play size={15} /> {t('dashboard.resume')}
            </Link>
          </div>
        </Card>
      ))}

      {loadFailed && <LoadError onRetry={retryAll} />}

      {todayStarts.length > 0 && <StartToday routines={todayStarts} t={t} />}

      {showChecklist && <OnboardingChecklist steps={steps} t={t} />}

      <WeeklySchedule
        effectiveUid={effectiveUid}
        routines={routines}
        routinesLoading={routinesLoading}
        sessions={sessions}
        schedule={schedule}
        scheduleLoading={scheduleLoading || (!!scheduleError && schedule.length === 0)}
        refreshSchedule={refreshSchedule}
      />

      <div className="grid grid-cols-2 gap-3">
        <Link to="/routines">
          <Card className="press-row flex flex-col items-center justify-center py-6 gap-2 text-center hover:bg-surface2 transition-colors">
            <Dumbbell size={22} className="text-irontext" />
            <span className="text-sm">{t('dashboard.navRoutines')}</span>
            <span className="text-chalkdim text-xs">
              {routines.length} {t('dashboard.routinesCount')}
            </span>
          </Card>
        </Link>
        <Link to="/history">
          <Card className="press-row flex flex-col items-center justify-center py-6 gap-2 text-center hover:bg-surface2 transition-colors">
            <HistoryIcon size={22} className="text-irontext" />
            <span className="text-sm">{t('dashboard.navHistory')}</span>
            <span className="text-chalkdim text-xs">
              {sessions.length} {t('dashboard.sessions')}
            </span>
          </Card>
        </Link>
      </div>
    </div>
  )
}

// One tap from the dashboard to today's workout (same route as the play
// button in the day panel). First pending routine is the big button, any
// others (a day can hold mobility + strength + cardio) are smaller.
function StartToday({ routines, t }) {
  const [first, ...others] = routines
  return (
    <div className="flex flex-col gap-2">
      <Link
        to={`/workout/${first.id}`}
        className="press flex items-center justify-between gap-3 rounded-md px-5 py-4 min-h-[64px] bg-brass text-ink hover:bg-brass/90 transition-colors"
      >
        <span className="min-w-0">
          <span className="block text-lg font-medium leading-tight truncate">{t('dashboard.startRoutine', { name: first.name })}</span>
          <span className="block text-xs opacity-75 mt-0.5">
            {first.exercises?.length || 0} {t('dashboard.exercisesCount')}
          </span>
        </span>
        <Play size={22} className="shrink-0" />
      </Link>
      {others.map((r) => (
        <Link
          key={r.id}
          to={`/workout/${r.id}`}
          className="press flex items-center justify-between gap-3 rounded-md px-4 py-2.5 min-h-[44px] bg-brasssoft text-brass hover:bg-brasssoft/70 text-sm font-medium transition-colors"
        >
          <span className="truncate">{t('dashboard.startRoutine', { name: r.name })}</span>
          <Play size={15} className="shrink-0" />
        </Link>
      ))}
    </div>
  )
}

function OnboardingChecklist({ steps, t }) {
  const doneCount = steps.filter((s) => s.done).length
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl">{t('dashboard.getSetUp')}</h2>
        <span className="eyebrow">
          {doneCount}/{steps.length}
        </span>
      </div>
      <div className="flex flex-col divide-y divide-line">
        {steps.map((s, i) => (
          <Link
            key={i}
            to={s.to}
            className={`flex items-center gap-3 py-3 ${s.done ? 'opacity-50' : 'hover:bg-surface2 -mx-2 px-2 rounded-md'}`}
          >
            {s.done ? <Check size={18} className="text-good shrink-0" /> : <Circle size={18} className="text-chalkdim shrink-0" />}
            <div className="min-w-0">
              <p className={s.done ? 'line-through' : ''}>{s.label}</p>
              <p className="text-chalkdim text-xs">{s.body}</p>
            </div>
            {!s.done && <Plus size={16} className="text-brass ms-auto shrink-0" />}
          </Link>
        ))}
      </div>
    </Card>
  )
}
