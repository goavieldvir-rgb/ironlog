import React from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, Play } from 'lucide-react'
import { useAdmin } from '../context/AdminContext.jsx'
import { useCollection } from '../lib/db.js'
import { Card, CategoryTag } from './ui.jsx'

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

export default function SessionDetail() {
  const { effectiveUid } = useAdmin()
  const { id } = useParams()
  const [sessions, loading] = useCollection(effectiveUid, 'sessions', 'date', 'desc')
  const session = sessions.find((s) => s.id === id)

  if (!loading && !session) return <p className="text-chalkdim">Session not found.</p>
  if (!session) return null

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <Link to="/history" className="text-chalkdim text-sm inline-flex items-center gap-1 hover:text-chalk w-fit">
        <ChevronLeft size={15} /> History
      </Link>

      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-3xl">{session.routine_name}</h1>
          <CategoryTag category={session.category} />
        </div>
        <p className="text-chalkdim text-sm mt-1">{formatDate(session.date)}</p>
      </div>

      {session.notes && (
        <Card className="text-sm text-chalkdim italic">"{session.notes}"</Card>
      )}

      {(session.entries || []).map((entry, i) => (
        <Card key={i} className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-lg">{entry.name}</h3>
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
          </div>
          <div className="flex flex-wrap gap-2">
            {(entry.sets || []).map((s, j) => (
              <div key={j} className="bg-surface2 rounded-md px-3 py-1.5 text-sm num">
                <span className="text-chalkdim mr-1">#{j + 1}</span>
                {s.weight || 0}
                {entry.unit} × {s.reps || 0}
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  )
}
