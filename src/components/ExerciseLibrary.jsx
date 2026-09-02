import React, { useMemo, useState } from 'react'
import { Plus, Play, Pencil, Trash2 } from 'lucide-react'
import { useAdmin } from '../context/AdminContext.jsx'
import { useCollection, addExercise, updateExercise, deleteExercise } from '../lib/db.js'
import { Button, Card, CategoryTag, Badge, EmptyState, Field } from './ui.jsx'

const emptyForm = { name: '', category: 'strength', videoUrl: '', notes: '', unit: 'kg', bodyweight: false }

function formatLast(ex) {
  if (ex.last_weight == null) return null
  if (ex.bodyweight) {
    const added = Number(ex.last_weight) > 0 ? `+${ex.last_weight}${ex.unit} ` : ''
    return `Last: ${added}Bodyweight × ${ex.last_reps}`
  }
  return `Last: ${ex.last_weight}${ex.unit} × ${ex.last_reps}`
}

export default function ExerciseLibrary() {
  const { effectiveUid } = useAdmin()
  const [exercises, loading, refresh] = useCollection(effectiveUid, 'exercises', 'name', 'asc')
  const [tab, setTab] = useState('all')
  const [editing, setEditing] = useState(null) // null = closed, {} = new, {...} = edit
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    return exercises.filter((e) => {
      if (tab !== 'all' && e.category !== tab) return false
      if (q && !e.name.toLowerCase().includes(q.toLowerCase())) return false
      return true
    })
  }, [exercises, tab, q])

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="eyebrow mb-1">Library</div>
          <h1 className="text-3xl">Exercises</h1>
        </div>
        <Button onClick={() => setEditing(emptyForm)}>
          <Plus size={16} /> Add exercise
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 justify-between">
        <Tabs tab={tab} setTab={setTab} />
        <input
          placeholder="Search exercises…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full sm:w-56"
        />
      </div>

      {!loading && filtered.length === 0 && (
        <EmptyState
          title="No exercises yet"
          body="Build your library first — add a name, an optional demo video link, and a category. You'll pick from these when building routines."
          action={
            <Button variant="brass" onClick={() => setEditing(emptyForm)}>
              <Plus size={16} /> Add your first exercise
            </Button>
          }
        />
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        {filtered.map((ex) => (
          <Card key={ex.id} className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg leading-tight">{ex.name}</h3>
                  <CategoryTag category={ex.category} />
                  {ex.bodyweight && <Badge tone="brass">Bodyweight</Badge>}
                </div>
                {formatLast(ex) && <p className="num text-chalkdim text-xs mt-1">{formatLast(ex)}</p>}
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  className="p-1.5 rounded hover:bg-surface2 text-chalkdim hover:text-chalk"
                  onClick={() => setEditing({ ...ex, videoUrl: ex.video_url })}
                  title="Edit"
                >
                  <Pencil size={15} />
                </button>
                <button
                  className="p-1.5 rounded hover:bg-ironsoft text-chalkdim hover:text-iron"
                  onClick={() => {
                    if (confirm(`Delete "${ex.name}"? This won't remove it from past history.`)) {
                      deleteExercise(effectiveUid, ex.id).then(refresh)
                    }
                  }}
                  title="Delete"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            {ex.notes && <p className="text-chalkdim text-sm">{ex.notes}</p>}
            {ex.video_url && (
              <a
                href={ex.video_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-brass hover:underline w-fit"
              >
                <Play size={14} /> Watch example
              </a>
            )}
          </Card>
        ))}
      </div>

      {editing && (
        <ExerciseModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            if (editing.id) {
              await updateExercise(effectiveUid, editing.id, data)
            } else {
              await addExercise(effectiveUid, data)
            }
            refresh()
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

export function Tabs({ tab, setTab }) {
  const opts = [
    { id: 'all', label: 'All' },
    { id: 'strength', label: 'Strength' },
    { id: 'mobility', label: 'Mobility / Physio' },
  ]
  return (
    <div className="flex rounded-md bg-surface2 p-1 text-sm w-fit">
      {opts.map((o) => (
        <button
          key={o.id}
          onClick={() => setTab(o.id)}
          className={`px-3 py-1.5 rounded transition-colors ${
            tab === o.id ? 'bg-ink text-chalk' : 'text-chalkdim'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function ExerciseModal({ initial, onClose, onSave }) {
  const [form, setForm] = useState({ ...emptyForm, ...initial })
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave(form)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm z-30 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-2xl mb-4">{initial.id ? 'Edit exercise' : 'New exercise'}</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Name">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Barbell back squat"
              required
              autoFocus
            />
          </Field>

          <Field label="Category">
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="strength">Strength</option>
              <option value="mobility">Mobility / Physio</option>
            </select>
          </Field>

          <Field label="How is weight tracked?">
            <select
              value={form.bodyweight ? 'bodyweight' : form.unit}
              onChange={(e) => {
                const v = e.target.value
                if (v === 'bodyweight') setForm({ ...form, bodyweight: true })
                else setForm({ ...form, bodyweight: false, unit: v })
              }}
            >
              <option value="kg">Weight in kg</option>
              <option value="lb">Weight in lb</option>
              <option value="bodyweight">Bodyweight (e.g. pull-ups, dips)</option>
            </select>
          </Field>

          {form.bodyweight && (
            <Field label="Added weight unit (optional extra weight)">
              <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                <option value="kg">kg</option>
                <option value="lb">lb</option>
              </select>
            </Field>
          )}

          <Field label="Example video link (optional)">
            <input
              type="url"
              value={form.videoUrl}
              onChange={(e) => setForm({ ...form, videoUrl: e.target.value })}
              placeholder="https://youtube.com/…"
            />
          </Field>

          <Field label="Notes (optional)">
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Cues, target muscle, equipment…"
              rows={2}
            />
          </Field>

          <div className="flex gap-2 justify-end mt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
