import React, { useMemo, useState } from 'react'
import { Search, Plus, Check } from 'lucide-react'
import { useGlobalExercises } from '../lib/db.js'
import { Button, CategoryTag, Badge } from './ui.jsx'

export default function ExercisePicker({ existingNames, onAdd, onCreateCustom, onClose }) {
  const [globalExercises, loading] = useGlobalExercises()
  const [q, setQ] = useState('')
  const [tab, setTab] = useState('all')
  const [addedIds, setAddedIds] = useState(new Set())

  const existingLower = useMemo(() => new Set(existingNames.map((n) => n.toLowerCase())), [existingNames])

  const filtered = useMemo(() => {
    return globalExercises.filter((g) => {
      if (tab !== 'all' && g.category !== tab) return false
      if (q && !g.name.toLowerCase().includes(q.toLowerCase())) return false
      return true
    })
  }, [globalExercises, tab, q])

  async function handleAdd(g) {
    await onAdd(g)
    setAddedIds((prev) => new Set(prev).add(g.id))
  }

  return (
    <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm z-30 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card p-6 w-full max-w-lg max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-2xl mb-1">Add an exercise</h2>
        <p className="text-chalkdim text-sm mb-4">Browse the shared library, or create your own if it's not here.</p>

        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-chalkdim" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search exercises…"
              className="w-full pl-8"
              autoFocus
            />
          </div>
        </div>

        <div className="flex rounded-md bg-surface2 p-1 text-sm w-fit mb-3">
          {[
            { id: 'all', label: 'All' },
            { id: 'strength', label: 'Strength' },
            { id: 'mobility', label: 'Mobility' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded transition-colors ${tab === t.id ? 'bg-ink text-chalk' : 'text-chalkdim'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto -mx-2 px-2 flex flex-col gap-1 min-h-[200px]">
          {loading && <p className="text-chalkdim text-sm py-4">Loading library…</p>}
          {!loading && filtered.length === 0 && <p className="text-chalkdim text-sm py-4">No matches — try creating a custom one below.</p>}
          {filtered.map((g) => {
            const already = existingLower.has(g.name.toLowerCase()) || addedIds.has(g.id)
            return (
              <div key={g.id} className="flex items-center justify-between gap-2 px-2 py-2 rounded-md hover:bg-surface2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate">{g.name}</span>
                  <CategoryTag category={g.category} />
                  {g.bodyweight && <Badge tone="brass">BW</Badge>}
                </div>
                <button
                  onClick={() => !already && handleAdd(g)}
                  disabled={already}
                  className={`shrink-0 inline-flex items-center gap-1 text-xs px-2 py-1 rounded ${
                    already ? 'text-good' : 'text-brass hover:bg-brasssoft'
                  }`}
                >
                  {already ? (
                    <>
                      <Check size={13} /> Added
                    </>
                  ) : (
                    <>
                      <Plus size={13} /> Add
                    </>
                  )}
                </button>
              </div>
            )
          })}
        </div>

        <div className="flex gap-2 justify-between items-center mt-4 pt-4 border-t border-line">
          <button onClick={onCreateCustom} className="text-brass text-sm hover:underline">
            Can't find it? Create a custom exercise
          </button>
          <Button variant="ghost" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  )
}
