import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Play, Plus, Flame, Check, Circle, Clock } from 'lucide-react'
import { ForwardChevron } from './DirectionalIcon.jsx'
import { InfoTip } from './InfoTip.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { toLocalISODate } from '../lib/dates.js'
import { useAdmin } from '../context/AdminContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useCollection } from '../lib/db.js'
import { loadDraft, clearDraft } from '../lib/draft.js'
import { Button, Card, CategoryTag } from './ui.jsx'

function startOfWeekISO() {
  const d = new Date()
  const day = d.getDay() === 0 ? 6 : d.getDay() - 1
  d.setDate(d.getDate() - day)
  return toLocalISODate(d)
}

function formatDate(iso) {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function timeAgo(ts) {
  const mins = Math.max(1, Math.round((Date.now() - ts) / 60000))
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

export default function Dashboard() {
  const { user } = useAuth()
  const { actingAs, effectiveUid, effectiveName } = useAdmin()
  const { t } = useLanguage()
  const [exercises] = useCollection(effectiveUid, 'exercises', 'name', 'asc')
  const [routines] = useCollection(effectiveUid, 'routines', 'created_at', 'desc')
  const [sessions, sessionsLoading] = useCollection(effectiveUid, 'sessions', 'date', 'desc')

  const weekStart = startOfWeekISO()
  const thisWeek = sessions.filter((s) => s.date >= weekStart).length
  const recent = sessions.slice(0, 5)

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
  const showChecklist = !sessionsLoading && !allDone

  const [draft, setDraft] = useState(null)
  useEffect(() => {
    setDraft(loadDraft(effectiveUid))
  }, [effectiveUid])

  function discardDraft() {
    clearDraft(effectiveUid)
    setDraft(null)
  }

  const firstName = (user.displayName || user.email || '').split(/[\s@]/)[0]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="eyebrow mb-1">
          {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
        <h1 className="text-3xl">
          {actingAs
            ? `${effectiveName}${t('dashboard.trainingLog')}`
            : `${t('dashboard.welcomeBack')}${firstName ? `, ${firstName}` : ''}.`}
        </h1>
      </div>

      {draft && (
        <Card className="border-brass/60 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <Clock size={18} className="text-brass shrink-0 mt-0.5" />
            <div>
              <div className="eyebrow text-brass mb-0.5 flex items-center gap-1.5 flex-wrap">
                {t('dashboard.inProgress')}
                <InfoTip text={t('dashboard.inProgressTip')} />
              </div>
              <p className="text-lg leading-tight">{draft.routineName}</p>
              <p className="text-chalkdim text-xs mt-0.5">
                {timeAgo(draft.savedAt)} · {draft.entries?.length || 0} {t('dashboard.exerciseLoggedSoFar')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button onClick={discardDraft} className="text-chalkdim text-xs hover:text-iron">
              {t('dashboard.discard')}
            </button>
            <Link to={`/workout/${draft.routineId || 'freestyle'}`}>
              <Button variant="brass">
                <Play size={15} /> {t('dashboard.resume')}
              </Button>
            </Link>
          </div>
        </Card>
      )}

      {showChecklist && <OnboardingChecklist steps={steps} t={t} />}

      <div className="grid grid-cols-3 gap-3">
        <Stat label={t('dashboard.thisWeek')} value={thisWeek} suffix={t('dashboard.sessions')} />
        <Stat label={t('dashboard.totalLogged')} value={sessions.length} suffix={t('dashboard.sessions')} />
        <Stat label={t('dashboard.routinesLabel')} value={routines.length} suffix={t('dashboard.active')} />
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="eyebrow">{t('dashboard.continueTraining')}</h2>
          <Link to="/routines" className="text-chalkdim text-xs hover:text-chalk inline-flex items-center gap-0.5">
            {t('dashboard.allRoutines')} <ForwardChevron size={13} />
          </Link>
        </div>
        {routines.length === 0 ? (
          <p className="text-sm text-chalkdim">
            {t('dashboard.noRoutinesYet')}{' '}
            <Link to="/routines/new" className="text-brass hover:underline">
              {t('dashboard.buildOne')}
            </Link>
            .
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {routines.slice(0, 4).map((r) => (
              <Card key={r.id} className="row flex items-center justify-between gap-2 !border-0 px-3.5 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="truncate min-w-0">{r.name}</p>
                    <CategoryTag category={r.category} />
                  </div>
                  <p className="text-chalkdim text-xs mt-0.5">
                    {r.exercises?.length || 0} {t('dashboard.exercisesCount')}
                  </p>
                </div>
                <Link to={`/workout/${r.id}`}>
                  <Button variant="subtle" className="shrink-0">
                    <Play size={14} />
                  </Button>
                </Link>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="eyebrow">{t('dashboard.recentActivity')}</h2>
          <Link to="/history" className="text-chalkdim text-xs hover:text-chalk inline-flex items-center gap-0.5">
            {t('dashboard.fullHistory')} <ForwardChevron size={13} />
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-chalkdim inline-flex items-center gap-1.5">
            <Flame size={14} /> {t('dashboard.noSessionsYet')}
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {recent.map((s) => (
              <Link key={s.id} to={`/history/${s.id}`}>
                <div className="row flex items-center justify-between px-3.5 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="num text-chalkdim text-xs shrink-0">{formatDate(s.date)}</span>
                    <p className="truncate min-w-0">{s.routine_name}</p>
                    <CategoryTag category={s.category} />
                  </div>
                  <ForwardChevron size={16} className="text-chalkdim shrink-0" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
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

function Stat({ label, value, suffix }) {
  return (
    <Card className="flex flex-col items-center justify-center py-5 gap-1 text-center">
      <span className="num text-4xl text-chalk leading-none">{value}</span>
      <span className="eyebrow">{suffix}</span>
      <span className="text-chalkdim text-xs">{label}</span>
    </Card>
  )
}
