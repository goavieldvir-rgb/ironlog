import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Play, Pencil, Trash2, Dumbbell, Copy, Send } from 'lucide-react'
import { useAdmin } from '../context/AdminContext.jsx'
import { useCollection, deleteRoutine, addRoutine } from '../lib/db.js'
import { supabase } from '../supabase.js'
import { Button, Card, CategoryTag, EmptyState } from './ui.jsx'
import { Tabs } from './ExerciseLibrary.jsx'

export default function RoutineList() {
  const { effectiveUid, isAdmin } = useAdmin()
  const [routines, loading, refresh] = useCollection(effectiveUid, 'routines', 'created_at', 'desc')
  const [tab, setTab] = useState('all')
  const [copyTarget, setCopyTarget] = useState(null) // routine being copied to another person

  const filtered = useMemo(
    () => routines.filter((r) => tab === 'all' || r.category === tab),
    [routines, tab],
  )

  async function duplicateRoutine(r) {
    await addRoutine(effectiveUid, {
      name: `${r.name} (copy)`,
      category: r.category,
      exercises: r.exercises,
    })
    refresh()
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="eyebrow mb-1">Plan</div>
          <h1 className="text-3xl">Routines</h1>
        </div>
        <Link to="/routines/new">
          <Button>
            <Plus size={16} /> Build routine
          </Button>
        </Link>
      </div>

      <Tabs tab={tab} setTab={setTab} />

      {!loading && filtered.length === 0 && (
        <EmptyState
          title="No routines yet"
          body="A routine is a template — a set of exercises with target sets and reps. Build one once, then follow it every time you train."
          action={
            <Link to="/routines/new">
              <Button variant="brass">
                <Plus size={16} /> Build your first routine
              </Button>
            </Link>
          }
        />
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        {filtered.map((r) => (
          <Card key={r.id} className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg leading-tight">{r.name}</h3>
                  <CategoryTag category={r.category} />
                </div>
                <p className="text-chalkdim text-xs mt-1">{r.exercises?.length || 0} exercises</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  className="p-1.5 rounded hover:bg-surface2 text-chalkdim hover:text-chalk"
                  onClick={() => duplicateRoutine(r)}
                  title="Duplicate"
                >
                  <Copy size={15} />
                </button>
                {isAdmin && (
                  <button
                    className="p-1.5 rounded hover:bg-brasssoft text-chalkdim hover:text-brass"
                    onClick={() => setCopyTarget(r)}
                    title="Copy to another person"
                  >
                    <Send size={15} />
                  </button>
                )}
                <Link to={`/routines/${r.id}/edit`} className="p-1.5 rounded hover:bg-surface2 text-chalkdim hover:text-chalk">
                  <Pencil size={15} />
                </Link>
                <button
                  className="p-1.5 rounded hover:bg-ironsoft text-chalkdim hover:text-iron"
                  onClick={() => {
                    if (confirm(`Delete routine "${r.name}"? Past sessions stay in your history.`)) {
                      deleteRoutine(effectiveUid, r.id).then(refresh)
                    }
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            <ul className="text-sm text-chalkdim flex flex-col gap-0.5">
              {(r.exercises || []).slice(0, 4).map((e, i) => (
                <li key={i} className="flex justify-between">
                  <span className="text-chalk">{e.name}</span>
                  <span className="num">
                    {e.targetSets}×{e.targetReps}
                  </span>
                </li>
              ))}
              {(r.exercises?.length || 0) > 4 && <li>+{r.exercises.length - 4} more</li>}
            </ul>

            <Link to={`/workout/${r.id}`} className="mt-1">
              <Button variant="brass" className="w-full">
                <Play size={15} /> Start session
              </Button>
            </Link>
          </Card>
        ))}
      </div>

      <Link to="/workout/freestyle" className="text-chalkdim text-sm inline-flex items-center gap-1.5 hover:text-chalk w-fit">
        <Dumbbell size={14} /> Or log a freestyle session without a routine
      </Link>

      {copyTarget && <CopyToPersonModal routine={copyTarget} onClose={() => setCopyTarget(null)} />}
    </div>
  )
}

function CopyToPersonModal({ routine, onClose }) {
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [copiedTo, setCopiedTo] = useState(null)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .order('email', { ascending: true })
      .then(({ data, error }) => {
        if (error) console.error(error)
        setPeople(data || [])
        setLoading(false)
      })
  }, [])

  async function copyTo(person) {
    await addRoutine(person.id, {
      name: routine.name,
      category: routine.category,
      exercises: routine.exercises,
    })
    setCopiedTo(person.id)
  }

  return (
    <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm z-30 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl mb-1">Copy "{routine.name}"</h2>
        <p className="text-chalkdim text-sm mb-4">Pick who to copy this routine to.</p>

        <div className="flex flex-col gap-1 max-h-72 overflow-y-auto">
          {loading && <p className="text-chalkdim text-sm py-2">Loading…</p>}
          {people.map((p) => (
            <button
              key={p.id}
              onClick={() => copyTo(p)}
              disabled={copiedTo === p.id}
              className="flex items-center justify-between px-2 py-2 rounded-md hover:bg-surface2 text-left disabled:opacity-50"
            >
              <span className="truncate">{p.full_name || p.email}</span>
              <span className="text-xs text-brass">{copiedTo === p.id ? 'Copied' : 'Copy here'}</span>
            </button>
          ))}
        </div>

        <div className="flex justify-end mt-4 pt-4 border-t border-line">
          <Button variant="ghost" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  )
}
