import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Play, Plus, Check, Circle, Clock, Dumbbell, History as HistoryIcon } from 'lucide-react'
import { InfoTip } from './InfoTip.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useAdmin } from '../context/AdminContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useCollection } from '../lib/db.js'
import { loadDraft, clearDraft } from '../lib/draft.js'
import { Button, Card } from './ui.jsx'
import WeeklySchedule from './WeeklySchedule.jsx'

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

      <WeeklySchedule effectiveUid={effectiveUid} routines={routines} />

      <div className="grid grid-cols-2 gap-3">
        <Link to="/routines">
          <Card className="flex flex-col items-center justify-center py-6 gap-2 text-center hover:bg-surface2 transition-colors">
            <Dumbbell size={22} className="text-iron" />
            <span className="text-sm">{t('dashboard.navRoutines')}</span>
            <span className="text-chalkdim text-xs">
              {routines.length} {t('dashboard.exercisesCount')}
            </span>
          </Card>
        </Link>
        <Link to="/history">
          <Card className="flex flex-col items-center justify-center py-6 gap-2 text-center hover:bg-surface2 transition-colors">
            <HistoryIcon size={22} className="text-iron" />
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
