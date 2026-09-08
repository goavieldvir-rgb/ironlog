import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trash2, ChevronRight } from 'lucide-react'
import { useAdmin } from '../context/AdminContext.jsx'
import { useCollection, deleteSession } from '../lib/db.js'
import { Card, CategoryTag, EmptyState, Button } from './ui.jsx'
import { Tabs } from './ExerciseLibrary.jsx'

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

export default function History() {
  const { effectiveUid } = useAdmin()
  const [sessions, loading, refresh] = useCollection(effectiveUid, 'sessions', 'date', 'desc')
  const [tab, setTab] = useState('all')

  const filtered = useMemo(
    () => sessions.filter((s) => tab === 'all' || s.category === tab),
    [sessions, tab],
  )

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="eyebrow mb-1">Log</div>
        <h1 className="text-3xl">History</h1>
      </div>

      <Tabs tab={tab} setTab={setTab} />

      {!loading && filtered.length === 0 && (
        <EmptyState
          title="No sessions logged yet"
          body="Once you finish a workout it'll show up here — full detail, every set, so you can track how you're progressing over time."
          action={
            <Link to="/routines">
              <Button variant="brass">Start a session</Button>
            </Link>
          }
        />
      )}

      <div className="flex flex-col gap-2">
        {filtered.map((s) => {
          const totalSets = (s.entries || []).reduce((n, e) => n + (e.sets?.length || 0), 0)
          return (
            <Link key={s.id} to={`/history/${s.id}`}>
              <Card className="flex items-center justify-between gap-3 hover:border-brass/50 transition-colors">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <h3 className="text-lg leading-tight truncate min-w-0">{s.routine_name}</h3>
                    <CategoryTag category={s.category} />
                  </div>
                  <p className="text-chalkdim text-xs mt-1">
                    {formatDate(s.date)} · {s.entries?.length || 0} exercises · {totalSets} sets
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      if (confirm('Delete this session from your history?')) deleteSession(effectiveUid, s.id).then(refresh)
                    }}
                    className="p-1.5 rounded hover:bg-ironsoft text-chalkdim hover:text-iron"
                  >
                    <Trash2 size={15} />
                  </button>
                  <ChevronRight size={18} className="text-chalkdim" />
                </div>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
