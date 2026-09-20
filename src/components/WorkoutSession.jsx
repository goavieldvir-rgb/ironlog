import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { Plus, Check } from 'lucide-react'
import { BackChevron } from './DirectionalIcon.jsx'
import { InfoTip } from './InfoTip.jsx'
import { useAdmin } from '../context/AdminContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useCollection, logSession } from '../lib/db.js'
import { saveDraft, loadDraft, clearDraft } from '../lib/draft.js'
import { toLocalISODate } from '../lib/dates.js'
import { Button, Card, CategoryTag, Field } from './ui.jsx'
import SessionEntryCard from './SessionEntryCard.jsx'
import RestTimer from './RestTimer.jsx'

function todayISO() {
  return toLocalISODate()
}

function emptySet(category) {
  return category === 'cardio' ? { duration: '', intensity: '', distance: '' } : { weight: '', reps: '', rir: '' }
}

export default function WorkoutSession() {
  const { effectiveUid } = useAdmin()
  const { t, lang } = useLanguage()
  const { routineId } = useParams()
  const navigate = useNavigate()
  const isFreestyle = routineId === 'freestyle'

  const [routines, routinesLoading] = useCollection(effectiveUid, 'routines', 'created_at', 'desc')
  const [exercises] = useCollection(effectiveUid, 'exercises', 'name', 'asc')
  const routine = useMemo(() => routines.find((r) => r.id === routineId), [routines, routineId])

  const [date, setDate] = useState(todayISO())
  const [notes, setNotes] = useState('')
  const [entries, setEntries] = useState([])
  const [pickId, setPickId] = useState('')
  // A one-time, this-session-only substitution — e.g. a machine is broken
  // at the gym today. Only the local `entries` state changes; the routine
  // document itself is never touched, so next time this routine is
  // started, the original exercise is back.
  const [swapIndex, setSwapIndex] = useState(null)
  const [swapPickId, setSwapPickId] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  // Tracks whether we've done the initial "restore a draft, or build fresh
  // from the routine" pass — autosave shouldn't run before that, or it'd
  // immediately overwrite a real draft with an empty one for a split second.
  const [ready, setReady] = useState(false)

  // A resumed draft's "previously logged" hints (lastWeight/lastReps/
  // lastSets) were frozen the moment the draft was first created — if you
  // started this workout days ago, abandoned it, and logged this same
  // exercise again in the meantime through a different routine, the
  // resumed draft would still show the OLD stale numbers, or none at all
  // if there was no history yet back when the draft was created. This
  // re-checks against your current exercise data on resume, so the hint
  // is always accurate — everything else about the draft (the actual
  // sets you'd already typed in, notes) is left completely untouched.
  function refreshLastKnownData(draftEntries, liveExercises) {
    return draftEntries.map((entry) => {
      const full = liveExercises.find((e) => e.id === entry.exerciseId)
      if (!full) return entry
      return {
        ...entry,
        lastWeight: full.last_weight,
        lastReps: full.last_reps,
        lastDistance: full.last_distance,
        lastSets: full.last_sets || [],
      }
    })
  }

  // On open: if there's a matching in-progress draft for this exact routine
  // (or this exact freestyle session) sitting in local storage, restore it
  // instead of starting fresh — this is what makes "Resume workout" work,
  // and also what saves you if Safari reloads the tab mid-session.
  useEffect(() => {
    if (isFreestyle) {
      const draft = loadDraft(effectiveUid)
      if (draft && draft.routineId === null) {
        setEntries(refreshLastKnownData(draft.entries || [], exercises))
        setDate(draft.date || todayISO())
        setNotes(draft.notes || '')
        setReady(true)
        return
      }
      setEntries([])
      setReady(true)
      return
    }
    if (routine) {
      const draft = loadDraft(effectiveUid)
      if (draft && draft.routineId === routine.id) {
        setEntries(refreshLastKnownData(draft.entries || [], exercises))
        setDate(draft.date || todayISO())
        setNotes(draft.notes || '')
        setReady(true)
        return
      }
      setEntries(
        routine.exercises.map((it) => {
          const full = exercises.find((e) => e.id === it.exerciseId)
          const category = it.category || full?.category || 'strength'
          if (category === 'cardio') {
            return {
              exerciseId: it.exerciseId,
              name: (lang === 'he' && full?.name_he) || full?.name || it.name,
              unit: it.unit,
              category: 'cardio',
              intensityType: it.intensityType || full?.intensity_type || 'rpe',
              videoUrl: full?.video_url || it.videoUrl || '',
              lastWeight: full?.last_weight,
              lastReps: full?.last_reps,
              lastDistance: full?.last_distance,
              lastSets: full?.last_sets || [],
              notes: '',
              sets: [
                {
                  duration: String(it.targetDuration ?? full?.last_weight ?? 20),
                  intensity: String(it.targetIntensity ?? full?.last_reps ?? 5),
                  distance: '',
                },
              ],
            }
          }
          return {
            exerciseId: it.exerciseId,
            name: (lang === 'he' && full?.name_he) || full?.name || it.name,
            unit: it.unit,
            bodyweight: it.bodyweight ?? full?.bodyweight ?? false,
            videoUrl: full?.video_url || it.videoUrl || '',
            lastWeight: full?.last_weight,
            lastReps: full?.last_reps,
            lastSets: full?.last_sets || [],
            notes: '',
            sets: Array.from({ length: it.targetSets || 3 }, () => ({ weight: '', reps: '', rir: '' })),
          }
        }),
      )
      setReady(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routine?.id, exercises.length, isFreestyle, effectiveUid])

  const category = isFreestyle ? 'strength' : routine?.category || 'strength'

  // Autosave every change to local storage so a backgrounded-tab reload
  // never wipes out what's already been logged.
  useEffect(() => {
    if (!ready || entries.length === 0) return
    saveDraft(effectiveUid, {
      routineId: isFreestyle ? null : routine?.id || null,
      routineName: isFreestyle ? t('workout.freestyleSession') : routine?.name,
      category,
      date,
      notes,
      entries,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, date, notes, ready])

  // Builds a fresh entry for a given exercise — shared by freestyle-add
  // and swap, so there's exactly one place that knows how to construct
  // an entry from scratch, not two slowly-diverging copies of the same
  // logic.
  function buildEntryFromExercise(ex, targetSets = 3) {
    if (ex.category === 'cardio') {
      return {
        exerciseId: ex.id,
        name: (lang === 'he' && ex.name_he) || ex.name,
        unit: ex.unit,
        category: 'cardio',
        intensityType: ex.intensity_type || 'rpe',
        videoUrl: ex.video_url || '',
        lastWeight: ex.last_weight,
        lastReps: ex.last_reps,
        lastDistance: ex.last_distance,
        lastSets: ex.last_sets || [],
        notes: '',
        sets: [{ duration: String(ex.last_weight ?? 20), intensity: String(ex.last_reps ?? 5), distance: '' }],
      }
    }
    return {
      exerciseId: ex.id,
      name: (lang === 'he' && ex.name_he) || ex.name,
      unit: ex.unit,
      bodyweight: !!ex.bodyweight,
      videoUrl: ex.video_url || '',
      lastWeight: ex.last_weight,
      lastReps: ex.last_reps,
      lastSets: ex.last_sets || [],
      notes: '',
      sets: Array.from({ length: targetSets }, () => ({ weight: '', reps: '', rir: '' })),
    }
  }

  function addFreestyleExercise() {
    const ex = exercises.find((e) => e.id === pickId)
    if (!ex) return
    setEntries([...entries, buildEntryFromExercise(ex)])
    setPickId('')
  }

  function performSwap() {
    const ex = exercises.find((e) => e.id === swapPickId)
    if (!ex || swapIndex == null) return
    // Keep whatever number of sets the original exercise had planned —
    // swapping shouldn't also reset how many sets you meant to do.
    const targetSets = entries[swapIndex]?.sets?.length || 3
    setEntries((prev) => prev.map((e, i) => (i === swapIndex ? buildEntryFromExercise(ex, targetSets) : e)))
    setSwapIndex(null)
    setSwapPickId('')
  }

  function updateSet(entryIdx, setIdx, patch) {
    setEntries((prev) =>
      prev.map((e, i) =>
        i !== entryIdx
          ? e
          : { ...e, sets: e.sets.map((s, j) => (j === setIdx ? { ...s, ...patch } : s)) },
      ),
    )
  }

  function updateNote(entryIdx, text) {
    setEntries((prev) => prev.map((e, i) => (i !== entryIdx ? e : { ...e, notes: text })))
  }

  function addSet(entryIdx) {
    setEntries((prev) =>
      prev.map((e, i) => (i !== entryIdx ? e : { ...e, sets: [...e.sets, emptySet(e.category)] })),
    )
  }

  function removeSet(entryIdx, setIdx) {
    setEntries((prev) =>
      prev.map((e, i) => (i !== entryIdx ? e : { ...e, sets: e.sets.filter((_, j) => j !== setIdx) })),
    )
  }

  function removeEntry(entryIdx) {
    setEntries((prev) => prev.filter((_, i) => i !== entryIdx))
  }

  async function handleFinish() {
    setSaving(true)
    try {
      await logSession(effectiveUid, {
        routineId: isFreestyle ? null : routine?.id,
        routineName: isFreestyle ? t('workout.freestyleSession') : routine?.name,
        category,
        date,
        notes,
        entries: entries.map((e) => ({
          exerciseId: e.exerciseId,
          name: e.name,
          unit: e.unit,
          category: e.category || 'strength',
          bodyweight: e.bodyweight,
          intensityType: e.intensityType,
          videoUrl: e.videoUrl,
          notes: e.notes || '',
          sets: e.sets,
        })),
      })
      clearDraft(effectiveUid)
      setSaved(true)
      setTimeout(() => navigate('/history'), 900)
    } finally {
      setSaving(false)
    }
  }

  if (!isFreestyle && !routinesLoading && !routine) {
    const draft = loadDraft(effectiveUid)
    if (draft?.routineId === routineId) clearDraft(effectiveUid)
    return <p className="text-chalkdim">{t('workout.routineNotFound')}</p>
  }

  const availableToAdd = exercises.filter((e) => !entries.some((en) => en.exerciseId === e.id))

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-5 max-w-2xl pb-4">
        <Link to="/routines" className="text-chalkdim text-sm inline-flex items-center gap-1 hover:text-chalk w-fit">
          <BackChevron size={15} /> {t('routines.title')}
        </Link>

        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-3xl">{isFreestyle ? t('workout.freestyleSession') : routine?.name}</h1>
              <CategoryTag category={category} />
            </div>
          </div>
          <Field label={t('workout.date')}>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-fit" />
          </Field>
        </div>

        {entries.map((entry, i) => (
          <SessionEntryCard
            key={entry.exerciseId + i}
            entry={entry}
            liveExercise={exercises.find((e) => e.id === entry.exerciseId)}
            removable={isFreestyle}
            onUpdateSet={(setIdx, patch) => updateSet(i, setIdx, patch)}
            onAddSet={() => addSet(i)}
            onRemoveSet={(setIdx) => removeSet(i, setIdx)}
            onRemoveEntry={() => removeEntry(i)}
            onUpdateNote={(text) => updateNote(i, text)}
            onSwapExercise={() => {
              setSwapIndex(i)
              setSwapPickId('')
            }}
          />
        ))}

        {isFreestyle && (
          <Card className="flex items-end gap-2">
            <Field label={t('workout.addExercise')}>
              <select value={pickId} onChange={(e) => setPickId(e.target.value)} className="w-56">
                <option value="">{t('workout.chooseFromLibrary')}</option>
                {availableToAdd.map((e) => (
                  <option key={e.id} value={e.id}>
                    {(lang === 'he' && e.name_he) || e.name} {e.category !== 'strength' ? `(${e.category})` : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Button type="button" variant="ghost" onClick={addFreestyleExercise} disabled={!pickId}>
              <Plus size={16} /> {t('common.add')}
            </Button>
          </Card>
        )}

        <Card>
          <Field
            label={
              <>
                {t('workout.sessionNotes')} <InfoTip text={t('workout.sessionNotesTip')} />
              </>
            }
          >
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('workout.sessionNotesPlaceholder')}
              rows={2}
            />
          </Field>
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleFinish} disabled={saving || saved || entries.length === 0} variant={saved ? 'subtle' : 'primary'}>
            {saved ? (
              <>
                <Check size={16} /> {t('workout.saved')}
              </>
            ) : saving ? (
              t('workout.saving')
            ) : (
              t('workout.finishSave')
            )}
          </Button>
        </div>
      </div>

      {swapIndex != null && (
        <div
          className="fixed inset-0 bg-ink/80 backdrop-blur-sm z-30 flex items-center justify-center p-4"
          onClick={() => setSwapIndex(null)}
        >
          <div className="card p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-2xl mb-2">{t('workout.swapTitle')}</h2>
            <p className="text-chalkdim text-sm mb-4">
              {t('workout.swapSubtitle', { name: entries[swapIndex]?.name })}
            </p>
            <Field label={t('workout.swapPickLabel')}>
              <select value={swapPickId} onChange={(e) => setSwapPickId(e.target.value)} className="w-full">
                <option value="">{t('workout.chooseFromLibrary')}</option>
                {availableToAdd.map((e) => (
                  <option key={e.id} value={e.id}>
                    {(lang === 'he' && e.name_he) || e.name} {e.category !== 'strength' ? `(${e.category})` : ''}
                  </option>
                ))}
              </select>
            </Field>
            <p className="text-chalkdim text-xs mt-2">{t('workout.swapNote')}</p>
            <div className="flex justify-end gap-2 mt-5">
              <Button type="button" variant="ghost" onClick={() => setSwapIndex(null)}>
                {t('common.cancel')}
              </Button>
              <Button type="button" onClick={performSwap} disabled={!swapPickId}>
                {t('workout.swapConfirm')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <RestTimer />
    </div>
  )
}
