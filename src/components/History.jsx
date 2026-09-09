import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trash2, ChevronRight, Search, X } from 'lucide-react'
import { useAdmin } from '../context/AdminContext.jsx'
import { useCollection, deleteSession } from '../lib/db.js'
import { Card, CategoryTag, EmptyState, Button, Field } from './ui.jsx'
import { Tabs } from './ExerciseLibrary.jsx'

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

// A session matches a text search if the routine name, any exercise name,
// or the session notes contain the query — so searching "bench" finds every
// session where you did a bench press, not just ones named "bench day".
function matchesQuery(session, q) {
  if (!q) return true
  const needle = q.toLowerCase()
  if (session.routine_name?.toLowerCase().includes(needle)) return true
  if (session.notes?.toLowerCase().includes(needle)) return true
  return (session.entries || []).some((e) => e.name?.toLowerCase().includes(needle))
}

export default function History() {
  const { effectiveUid } = useAdmin()
  const [sessions, loading, refresh] = useCollection(effectiveUid, 'sessions', 'date', 'desc')
  const [tab, setTab] = useState('all')
  const [q, setQ] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showDateFilter, setShowDateFilter] = useState(false)

  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      if (tab !== 'all' && s.category !== tab) return false
      if (dateFrom && s.date < dateFrom) return false
      if (dateTo && s.date > dateTo) return false
      if (!matchesQuery(s, q)) return false
      return true
    })
  }, [sessions, tab, q, dateFrom, dateTo])

  const hasActiveFilters = q || dateFrom || dateTo || tab !== 'all'

  function clearFilters() {
    setQ('')
    setDateFrom('')
    setDateTo('')
    setTab('all')
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="eyebrow mb-1">Log</div>
        <h1 className="text-3xl">History</h1>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-chalkdim" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by routine, exercise, or notes…"
              className="w-full pl-8"
            />
          </div>
          <Button variant="ghost" onClick={() => setShowDateFilter((v) => !v)}>
            Date range
          </Button>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="text-chalkdim text-xs hover:text-chalk inline-flex items-center gap-1">
              <X size={13} /> Clear filters
            </button>
          )}
        </div>

        {showDateFilter && (
          <div className="flex items-end gap-2 flex-wrap">
            <Field label="From">
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </Field>
            <Field label="To">
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </Field>
          </div>
        )}

        <Tabs tab={tab} setTab={setTab} />
      </div>

      {!loading && filtered.length === 0 && sessions.length > 0 && (
        <EmptyState
          title="No matches"
          body="Nothing in your history matches these filters — try a different search term or widen the date range."
          action={
            <Button variant="ghost" onClick={clearFilters}>
              Clear filters
            </Button>
          }
        />
      )}

      {!loading && sessions.length === 0 && (
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
