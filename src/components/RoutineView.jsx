import React, { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Pencil, Play, Link2, StickyNote } from 'lucide-react'
import { BackChevron } from './DirectionalIcon.jsx'
import { useAdmin } from '../context/AdminContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useCollection } from '../lib/db.js'
import { cleanRest, formatRest } from '../lib/rest.js'
import { loadDraft } from '../lib/draft.js'
import { Button, CategoryTag, LoadError } from './ui.jsx'

// A routine read-only: every exercise with its target, coach note and
// superset link, nothing editable. For a coach checking what a trainee is
// following without opening the editor (and risking a stray change).
export default function RoutineView() {
  const { id } = useParams()
  const { effectiveUid } = useAdmin()
  const { t, lang } = useLanguage()
  const [routines, loading, refresh, loadError] = useCollection(effectiveUid, 'routines', 'created_at', 'desc')
  const [exercises] = useCollection(effectiveUid, 'exercises', 'name', 'asc')
  const routine = routines.find((r) => r.id === id)
  const nameById = useMemo(
    () => Object.fromEntries(exercises.map((e) => [e.id, (lang === 'he' && e.name_he) || e.name])),
    [exercises, lang],
  )

  // A failed load must not read as "deleted".
  if (!loading && !routine && loadError) return <LoadError onRetry={refresh} />
  if (!loading && !routine) return <p className="text-chalkdim">{t('routines.notFound')}</p>
  if (!routine) return null

  return (
    <div className="flex flex-col gap-5 max-w-2xl pb-[120px]">
      <Link to="/routines" className="text-chalkdim text-sm inline-flex items-center gap-1 hover:text-chalk w-fit min-h-[44px] -mb-3">
        <BackChevron size={16} /> {t('routines.title')}
      </Link>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-[30px] leading-9 min-w-0 break-words">{routine.name}</h1>
          <Link
            to={`/routines/${routine.id}/edit`}
            className="press shrink-0 inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-full bg-surface text-sm font-medium text-chalk"
          >
            <Pencil size={14} /> {t('common.edit')}
          </Link>
        </div>
        <p className="text-chalkdim text-[13px]">
          {t('routines.exerciseCount')(routine.exercises?.length || 0)} · {t('routines.viewOnly')}
        </p>
        <div className="mt-1">
          <CategoryTag category={routine.category} />
        </div>
      </div>

      <RoutineExercises routine={routine} nameOf={(it) => nameById[it.exerciseId] || it.name} t={t} />

      <Button to={`/workout/${routine.id}`} variant="brass" className="w-full">
        <Play size={15} /> {loadDraft(effectiveUid, routine.id) ? t('routines.resumeSession') : t('routines.startSession')}
      </Button>
    </div>
  )
}

// What a routine item asks for, e.g. "3×10 · RIR 2" or "20 min · RPE 5".
export function itemTarget(routine, it, t) {
  if (routine.category === 'cardio' || it.category === 'cardio') {
    const intensity = it.targetIntensity != null ? ` · ${it.intensityType === 'hr_zone' ? t('exercises.hrZone') : t('exercises.rpe')} ${it.targetIntensity}` : ''
    return `${it.targetDuration ?? it.targetSets ?? ''} ${t('sessionCard.minUnit')}${intensity}`
  }
  const reps = it.targetReps !== '' && it.targetReps != null ? `×${it.targetReps}${it.timed ? t('routines.secSuffix') : ''}` : ''
  const rir = it.targetRir != null && it.targetRir !== '' ? ` · ${t('routines.rirShort')} ${it.targetRir}` : ''
  const rest = cleanRest(it.restSeconds) != null ? ` · ${t('rest.short')} ${formatRest(cleanRest(it.restSeconds))}` : ''
  return `${it.targetSets ?? ''}${reps}${rir}${rest}`
}

// The full exercise list of a routine, read-only. Shared with the coach page.
export function RoutineExercises({ routine, nameOf, t, compact = false }) {
  const items = routine.exercises || []
  if (items.length === 0) return <p className="text-sm text-chalkdim">{t('routines.noExercisesAdded')}</p>
  return (
    <ol className={compact ? 'flex flex-col' : 'bg-surface rounded-[20px] overflow-hidden'}>
      {items.map((it, i) => {
        const inSuperset = it.supersetWithNext || items[i - 1]?.supersetWithNext
        return (
          <li
            key={i}
            className={`flex flex-col gap-0.5 ${compact ? 'py-2 border-t border-white/[0.06] first:border-t-0' : 'px-4 py-3 border-t border-white/[0.06] first:border-t-0'}`}
          >
            <div className="flex items-center gap-3">
              <span className="w-5 shrink-0 text-chalkdim text-[13px] tabular-nums">{i + 1}</span>
              <span className={`flex-1 min-w-0 ${compact ? 'text-sm' : 'text-[15px]'} truncate`}>{nameOf(it)}</span>
              <bdi dir="ltr" className="num shrink-0 text-sm text-chalkdim">
                {itemTarget(routine, it, t)}
              </bdi>
            </div>
            {(inSuperset || it.coachNote) && (
              <div className="ps-8 flex flex-col gap-0.5 text-xs text-chalkdim">
                {it.supersetWithNext && (
                  <span className="inline-flex items-center gap-1 text-accent">
                    <Link2 size={12} aria-hidden="true" /> {t('routines.supersetNext')}
                  </span>
                )}
                {it.coachNote && (
                  <span className="inline-flex items-start gap-1">
                    <StickyNote size={12} className="shrink-0 mt-0.5" aria-hidden="true" />
                    <span className="whitespace-pre-wrap">{it.coachNote}</span>
                  </span>
                )}
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
