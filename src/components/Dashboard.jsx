import React, { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Play, Plus, ChevronRight, Flame } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { useAdmin } from '../context/AdminContext.jsx'
import { useCollection } from '../lib/db.js'
import { Button, Card, CategoryTag, EmptyState } from './ui.jsx'

function startOfWeekISO() {
  const d = new Date()
  const day = d.getDay() === 0 ? 6 : d.getDay() - 1
  d.setDate(d.getDate() - day)
  return d.toISOString().slice(0, 10)
}

function formatDate(iso) {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function Dashboard() {
  const { user } = useAuth()
  const { actingAs, effectiveUid, effectiveName } = useAdmin()
  const [exercises] = useCollection(effectiveUid, 'exercises', 'name', 'asc')
  const [routines] = useCollection(effectiveUid, 'routines', 'created_at', 'desc')
  const [sessions, sessionsLoading] = useCollection(effectiveUid, 'sessions', 'date', 'desc')

  const weekStart = startOfWeekISO()
  const thisWeek = sessions.filter((s) => s.date >= weekStart).length
  const recent = sessions.slice(0, 5)

  const isNew = !sessionsLoading && exercises.length === 0 && routines.length === 0

  const firstName = (user.displayName || user.email || '').split(/[\s@]/)[0]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="eyebrow mb-1">
          {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
        <h1 className="text-3xl">
          {actingAs ? `${effectiveName}'s training log` : `Welcome back${firstName ? `, ${firstName}` : ''}.`}
        </h1>
      </div>

      {isNew ? (
        <EmptyState
          title="Let's set up your log"
          body="Three steps: add a few exercises to your library (with a video link if you like), group them into a routine, then hit start and log your first session."
          action={
            <div className="flex gap-2 flex-wrap justify-center">
              <Link to="/exercises">
                <Button variant="brass">
                  <Plus size={16} /> Add exercises
                </Button>
              </Link>
              <Link to="/workout/freestyle">
                <Button variant="ghost">Log freestyle instead</Button>
              </Link>
            </div>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="This week" value={thisWeek} suffix="sessions" />
            <Stat label="Total logged" value={sessions.length} suffix="sessions" />
            <Stat label="Routines" value={routines.length} suffix="active" />
          </div>

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="eyebrow">Continue training</h2>
              <Link to="/routines" className="text-chalkdim text-xs hover:text-chalk inline-flex items-center gap-0.5">
                All routines <ChevronRight size={13} />
              </Link>
            </div>
            {routines.length === 0 ? (
              <Card className="text-sm text-chalkdim">
                No routines yet.{' '}
                <Link to="/routines/new" className="text-brass hover:underline">
                  Build one
                </Link>
                .
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {routines.slice(0, 4).map((r) => (
                  <Card key={r.id} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="truncate min-w-0">{r.name}</p>
                        <CategoryTag category={r.category} />
                      </div>
                      <p className="text-chalkdim text-xs mt-0.5">{r.exercises?.length || 0} exercises</p>
                    </div>
                    <Link to={`/workout/${r.id}`}>
                      <Button variant="subtle" className="shrink-0">
                        <Play size={14} />
                      </Button>
                    </Link>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="eyebrow">Recent activity</h2>
              <Link to="/history" className="text-chalkdim text-xs hover:text-chalk inline-flex items-center gap-0.5">
                Full history <ChevronRight size={13} />
              </Link>
            </div>
            {recent.length === 0 ? (
              <Card className="text-sm text-chalkdim inline-flex items-center gap-1.5">
                <Flame size={14} /> No sessions logged yet — start one above.
              </Card>
            ) : (
              <div className="flex flex-col gap-2">
                {recent.map((s) => (
                  <Link key={s.id} to={`/history/${s.id}`}>
                    <Card className="flex items-center justify-between hover:border-brass/50 transition-colors">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="num text-chalkdim text-xs shrink-0">{formatDate(s.date)}</span>
                        <p className="truncate min-w-0">{s.routine_name}</p>
                        <CategoryTag category={s.category} />
                      </div>
                      <ChevronRight size={16} className="text-chalkdim shrink-0" />
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, suffix }) {
  return (
    <Card className="flex flex-col items-center justify-center py-5 gap-1 text-center">
      <span className="num text-4xl text-chalk leading-none">{value}</span>
      <span className="eyebrow">{suffix}</span>
      <span className="text-chalkdim text-xs">{label}</span>
    </Card>
  )
}
