import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ChevronLeft, Play, Plus, Trash2, Check } from 'lucide-react'
import { useAdmin } from '../context/AdminContext.jsx'
import { useCollection, logSession } from '../lib/db.js'
import { Button, Card, CategoryTag, Field } from './ui.jsx'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function WorkoutSession() {
  const { effectiveUid } = useAdmin()
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
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Seed entries once the routine (or exercise library, for freestyle) is available.
  useEffect(() => {
    if (isFreestyle) {
      setEntries([])
      return
    }
    if (routine) {
      setEntries(
        routine.exercises.map((it) => {
          const full = exercises.find((e) => e.id === it.exerciseId)
          return {
            exerciseId: it.exerciseId,
            name: it.name,
            unit: it.unit,
            videoUrl: full?.video_url || it.videoUrl || '',
            lastWeight: full?.last_weight,
            lastReps: full?.last_reps,
            sets: Array.from({ length: it.targetSets || 3 }, () => ({ weight: '', reps: '' })),
          }
        }),
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routine?.id, exercises.length])

  const category = isFreestyle ? 'strength' : routine?.category || 'strength'

  function addFreestyleExercise() {
    const ex = exercises.find((e) => e.id === pickId)
    if (!ex) return
    setEntries([
      ...entries,
      {
        exerciseId: ex.id,
        name: ex.name,
        unit: ex.unit,
        videoUrl: ex.video_url || '',
        lastWeight: ex.last_weight,
        lastReps: ex.last_reps,
        sets: [{ weight: '', reps: '' }, { weight: '', reps: '' }, { weight: '', reps: '' }],
      },
    ])
    setPickId('')
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

  function addSet(entryIdx) {
    setEntries((prev) =>
      prev.map((e, i) => (i !== entryIdx ? e : { ...e, sets: [...e.sets, { weight: '', reps: '' }] })),
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
        routineName: isFreestyle ? 'Freestyle session' : routine?.name,
        category,
        date,
        notes,
        entries: entries.map((e) => ({
          exerciseId: e.exerciseId,
          name: e.name,
          unit: e.unit,
          videoUrl: e.videoUrl,
          sets: e.sets,
        })),
      })
      setSaved(true)
      setTimeout(() => navigate('/history'), 900)
    } finally {
      setSaving(false)
    }
  }

  if (!isFreestyle && !routinesLoading && !routine) {
    return <p className="text-chalkdim">Routine not found.</p>
  }

  const availableToAdd = exercises.filter((e) => !entries.some((en) => en.exerciseId === e.id))

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <Link to="/routines" className="text-chalkdim text-sm inline-flex items-center gap-1 hover:text-chalk w-fit">
        <ChevronLeft size={15} /> Routines
      </Link>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl">{isFreestyle ? 'Freestyle session' : routine?.name}</h1>
            <CategoryTag category={category} />
          </div>
        </div>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-fit" />
      </div>

      {entries.map((entry, i) => (
        <Card key={entry.exerciseId + i} className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-lg">{entry.name}</h3>
              {entry.lastWeight != null && (
                <p className="num text-chalkdim text-xs mt-0.5">
                  Previously: {entry.lastWeight}
                  {entry.unit} × {entry.lastReps}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {entry.videoUrl && (
                <a
                  href={entry.videoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-brass hover:underline"
                >
                  <Play size={13} /> Example
                </a>
              )}
              {isFreestyle && (
                <button onClick={() => removeEntry(i)} className="text-chalkdim hover:text-iron">
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="grid grid-cols-[2rem_1fr_1fr_1.5rem] gap-2 text-chalkdim eyebrow px-0.5">
              <span>Set</span>
              <span>Weight ({entry.unit})</span>
              <span>Reps</span>
              <span />
            </div>
            {entry.sets.map((s, j) => (
              <div key={j} className="grid grid-cols-[2rem_1fr_1fr_1.5rem] gap-2 items-center">
                <span className="num text-chalkdim text-sm">{j + 1}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  placeholder={entry.lastWeight != null ? String(entry.lastWeight) : '0'}
                  value={s.weight}
                  onChange={(e) => updateSet(i, j, { weight: e.target.value })}
                  className="num"
                />
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder={entry.lastReps != null ? String(entry.lastReps) : '0'}
                  value={s.reps}
                  onChange={(e) => updateSet(i, j, { reps: e.target.value })}
                  className="num"
                />
                <button onClick={() => removeSet(i, j)} className="text-chalkdim hover:text-iron">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button
              onClick={() => addSet(i)}
              className="text-chalkdim hover:text-chalk text-xs inline-flex items-center gap-1 mt-1 w-fit"
            >
              <Plus size={13} /> Add set
            </button>
          </div>
        </Card>
      ))}

      {isFreestyle && (
        <Card className="flex items-end gap-2">
          <Field label="Add exercise">
            <select value={pickId} onChange={(e) => setPickId(e.target.value)} className="w-56">
              <option value="">Choose from library…</option>
              {availableToAdd.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} {e.category === 'mobility' ? '(mobility)' : ''}
                </option>
              ))}
            </select>
          </Field>
          <Button type="button" variant="ghost" onClick={addFreestyleExercise} disabled={!pickId}>
            <Plus size={16} /> Add
          </Button>
        </Card>
      )}

      <Card>
        <Field label="Session notes (optional)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="How it felt, energy, anything to remember next time…"
            rows={2}
          />
        </Field>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleFinish} disabled={saving || saved || entries.length === 0} variant={saved ? 'subtle' : 'primary'}>
          {saved ? (
            <>
              <Check size={16} /> Saved
            </>
          ) : saving ? (
            'Saving…'
          ) : (
            'Finish & save session'
          )}
        </Button>
      </div>
    </div>
  )
}
