import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { Plus, Check, Library, Clock } from 'lucide-react'
import { BackChevron } from './DirectionalIcon.jsx'
import { InfoTip } from './InfoTip.jsx'
import { useAdmin } from '../context/AdminContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFeedback } from '../context/FeedbackContext.jsx'
import { useCollection, logSession, addExercise } from '../lib/db.js'
import { saveDraft, loadDraft, clearDraft } from '../lib/draft.js'
import { toLocalISODate } from '../lib/dates.js'
import { Button, Card, CategoryTag, Field } from './ui.jsx'
import SessionEntryCard from './SessionEntryCard.jsx'
import ExercisePicker from './ExercisePicker.jsx'
import { ExerciseModal, emptyExerciseForm } from './ExerciseLibrary.jsx'
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
  const { confirm, toast } = useFeedback()
  const { routineId } = useParams()
  const navigate = useNavigate()
  const isFreestyle = routineId === 'freestyle'

  const [routines, routinesLoading] = useCollection(effectiveUid, 'routines', 'created_at', 'desc')
  const [exercises, , refreshExercises] = useCollection(effectiveUid, 'exercises', 'name', 'asc')
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
  // Shared between freestyle-add and swap: whichever one is active is
  // tracked by swapIndex (null = adding, a number = swapping that entry),
  // so both flows can share this one picker and create-custom modal
  // instead of duplicating them.
  const [showLibraryPicker, setShowLibraryPicker] = useState(false)
  const [creatingCustom, setCreatingCustom] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  // When this workout was started — carried inside the draft, so resuming
  // after a phone lock or app switch keeps the original start time.
  const [startedAt, setStartedAt] = useState(null)
  const [now, setNow] = useState(Date.now())
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
        setStartedAt(draft.startedAt || null)
        setReady(true)
        return
      }
      setEntries([])
      setStartedAt(Date.now())
      setReady(true)
      return
    }
    if (routine) {
      const draft = loadDraft(effectiveUid)
      if (draft && draft.routineId === routine.id) {
        setEntries(refreshLastKnownData(draft.entries || [], exercises))
        setDate(draft.date || todayISO())
        setNotes(draft.notes || '')
        setStartedAt(draft.startedAt || null)
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
      setStartedAt(Date.now())
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
      startedAt,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, date, notes, ready, startedAt])

  // Ticks the elapsed-time display. Once a minute is plenty for a workout.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(id)
  }, [])

  // Duration only means something for a workout logged live today — not
  // one being backfilled for a past date, and not a draft abandoned
  // overnight and finished the next morning (hence the 5-hour cap).
  const isLive = startedAt && date === todayISO()
  const elapsedMin = isLive ? Math.max(0, Math.round((now - startedAt) / 60000)) : null
  function finalDuration() {
    if (!isLive) return null
    const m = Math.round((Date.now() - startedAt) / 60000)
    return m >= 1 && m <= 300 ? m : null
  }

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

  // Used by both the "browse library" and "create custom exercise" paths,
  // for both freestyle-add and swap — one place that knows how to place
  // a newly-picked-or-created exercise wherever it's needed, instead of
  // duplicating this per entry point.
  function applyPickedExercise(ex) {
    if (swapIndex != null) {
      const targetSets = entries[swapIndex]?.sets?.length || 3
      setEntries((prev) => prev.map((e, i) => (i === swapIndex ? buildEntryFromExercise(ex, targetSets) : e)))
      setSwapIndex(null)
    } else {
      setEntries((prev) => [...prev, buildEntryFromExercise(ex)])
    }
    setPickId('')
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
        startedAt: isLive ? new Date(startedAt).toISOString() : null,
        durationMinutes: finalDuration(),
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
    } catch (err) {
      console.error(err)
      // The draft is only cleared on success, so a failed save (usually
      // patchy gym signal) never loses anything — say so, so nobody
      // panics and starts re-typing their whole workout.
      if (err?.message === 'EMPTY_SESSION') toast(t('workout.nothingLogged'), 'error')
      else toast(t('workout.saveFailedKept'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDiscard() {
    const ok = await confirm({
      title: t('workout.discardTitle'),
      body: t('workout.discardBody'),
      confirmLabel: t('workout.discardConfirm'),
      danger: true,
    })
    if (!ok) return
    clearDraft(effectiveUid)
    navigate('/')
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
            {elapsedMin != null && elapsedMin <= 300 && (
              <p className="text-chalkdim text-xs mt-1 inline-flex items-center gap-1 num">
                <Clock size={12} /> {t('workout.elapsed', { min: elapsedMin })}
              </p>
            )}
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
          <Card className="flex items-end gap-2 flex-wrap">
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
            <Button type="button" variant="brass" onClick={() => setShowLibraryPicker(true)}>
              <Library size={16} /> {t('routines.browseLibrary')}
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

        <div className="flex justify-between items-center gap-2">
          <Button type="button" variant="danger" onClick={handleDiscard} disabled={saving || saved}>
            {t('workout.discard')}
          </Button>
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

      {swapIndex != null && !showLibraryPicker && !creatingCustom && (
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
            <button
              type="button"
              onClick={() => setShowLibraryPicker(true)}
              className="text-brass text-sm hover:underline mt-2 inline-flex items-center gap-1"
            >
              <Library size={14} /> {t('routines.browseLibrary')}
            </button>
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

      {showLibraryPicker && (
        <ExercisePicker
          existingNames={exercises.map((e) => e.name)}
          onAdd={async (g) => {
            const wasSwapping = swapIndex != null
            const ex = await addExercise(effectiveUid, {
              name: g.name,
              nameHe: g.nameHe,
              category: g.category,
              unit: g.unit,
              bodyweight: g.bodyweight,
              intensityType: g.intensity_type,
              videoUrl: '',
              notes: '',
            })
            refreshExercises()
            applyPickedExercise(ex)
            // A swap is a single "replace this one" action, so close
            // right after — but adding freely (freestyle) stays open,
            // matching how the library picker behaves everywhere else in
            // the app, so several exercises can be added in one go.
            if (wasSwapping) setShowLibraryPicker(false)
          }}
          onCreateCustom={() => {
            setShowLibraryPicker(false)
            setCreatingCustom(true)
          }}
          onClose={() => setShowLibraryPicker(false)}
        />
      )}

      {creatingCustom && (
        <ExerciseModal
          initial={{ ...emptyExerciseForm, category: swapIndex != null ? entries[swapIndex]?.category || 'strength' : category }}
          existingExercises={exercises}
          onClose={() => setCreatingCustom(false)}
          onSave={async (data) => {
            const ex = await addExercise(effectiveUid, data)
            refreshExercises()
            applyPickedExercise(ex)
            setCreatingCustom(false)
          }}
        />
      )}

      <RestTimer />
    </div>
  )
}
