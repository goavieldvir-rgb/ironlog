import React from 'react'
import { Play, Plus, Trash2, Minus, CornerDownLeft, History } from 'lucide-react'
import { Card } from './ui.jsx'

function Stepper({ value, onChange, step, min = 0 }) {
  function bump(delta) {
    const current = Number(value) || 0
    const next = Math.max(min, Math.round((current + delta) * 100) / 100)
    onChange(String(next))
  }
  return (
    <div className="flex items-stretch min-w-0">
      <button
        type="button"
        onClick={() => bump(-step)}
        className="px-1 shrink-0 rounded-l-md bg-surface2 text-chalkdim hover:text-chalk border border-line border-r-0"
      >
        <Minus size={11} />
      </button>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="num text-center !rounded-none !px-0.5 min-w-0 w-full"
      />
      <button
        type="button"
        onClick={() => bump(step)}
        className="px-1 shrink-0 rounded-r-md bg-surface2 text-chalkdim hover:text-chalk border border-line border-l-0"
      >
        <Plus size={11} />
      </button>
    </div>
  )
}

export default function SessionEntryCard({
  entry,
  onUpdateSet,
  onAddSet,
  onRemoveSet,
  onRemoveEntry,
  removable = false,
}) {
  const weightStep = entry.unit === 'lb' ? 5 : 2.5

  function copyFromPrevious(setIdx) {
    const prev = entry.sets[setIdx - 1]
    if (!prev) return
    onUpdateSet(setIdx, { weight: prev.weight, reps: prev.reps })
  }

  function useLastTime(setIdx) {
    if (entry.lastWeight == null) return
    onUpdateSet(setIdx, { weight: String(entry.lastWeight), reps: String(entry.lastReps) })
  }

  return (
    <Card className="flex flex-col gap-3">
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
          {removable && (
            <button onClick={onRemoveEntry} className="text-chalkdim hover:text-iron">
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="grid grid-cols-[1.2rem_minmax(0,1fr)_minmax(0,1fr)_3.25rem] gap-1 text-chalkdim eyebrow px-0.5">
          <span>Set</span>
          <span className="truncate">Wt ({entry.unit})</span>
          <span>Reps</span>
          <span />
        </div>
        {entry.sets.map((s, j) => (
          <div key={j} className="grid grid-cols-[1.2rem_minmax(0,1fr)_minmax(0,1fr)_3.25rem] gap-1 items-center">
            <span className="num text-chalkdim text-sm">{j + 1}</span>
            <Stepper value={s.weight} step={weightStep} onChange={(v) => onUpdateSet(j, { weight: v })} />
            <Stepper value={s.reps} step={1} onChange={(v) => onUpdateSet(j, { reps: v })} />
            <div className="flex items-center gap-0.5 justify-end min-w-0">
              {j === 0 && entry.lastWeight != null ? (
                <button
                  onClick={() => useLastTime(j)}
                  title="Use last time's numbers"
                  className="text-chalkdim hover:text-brass p-1"
                >
                  <History size={14} />
                </button>
              ) : j > 0 ? (
                <button
                  onClick={() => copyFromPrevious(j)}
                  title="Same as set above"
                  className="text-chalkdim hover:text-brass p-1"
                >
                  <CornerDownLeft size={14} />
                </button>
              ) : (
                <span className="w-6" />
              )}
              <button onClick={() => onRemoveSet(j)} className="text-chalkdim hover:text-iron p-1">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
        <button
          onClick={onAddSet}
          className="text-chalkdim hover:text-chalk text-xs inline-flex items-center gap-1 mt-1 w-fit"
        >
          <Plus size={13} /> Add set
        </button>
      </div>
    </Card>
  )
}
