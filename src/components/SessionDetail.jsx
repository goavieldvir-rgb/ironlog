import React, { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Play, Pencil, MessageSquareText, Check } from 'lucide-react'
import { BackChevron } from './DirectionalIcon.jsx'
import { useAdmin } from '../context/AdminContext.jsx'
import { useCollection, updateTrainerComment } from '../lib/db.js'
import { Card, CategoryTag, Badge, Button } from './ui.jsx'

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function formatSet(entry, s) {
  if (entry.category === 'cardio') {
    const intensityLabel = entry.intensityType === 'hr_zone' ? 'Zone' : 'RPE'
    const dist = s.distance !== '' && s.distance != null ? ` · ${s.distance}${entry.unit}` : ''
    return `${s.duration || 0} min · ${intensityLabel} ${s.intensity || 0}${dist}`
  }
  if (entry.bodyweight) {
    const added = Number(s.weight) > 0 ? `+${s.weight}${entry.unit} ` : ''
    return `${added}BW × ${s.reps || 0}`
  }
  return `${s.weight || 0}${entry.unit} × ${s.reps || 0}`
}

export default function SessionDetail() {
  const { effectiveUid, isAdmin } = useAdmin()
  const { id } = useParams()
  const [sessions, loading, refresh] = useCollection(effectiveUid, 'sessions', 'date', 'desc')
  const session = sessions.find((s) => s.id === id)

  if (!loading && !session) return <p className="text-chalkdim">Session not found.</p>
  if (!session) return null

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <Link to="/history" className="text-chalkdim text-sm inline-flex items-center gap-1 hover:text-chalk w-fit">
        <BackChevron size={15} /> History
      </Link>

      <div>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-3xl">{session.routine_name}</h1>
            <CategoryTag category={session.category} />
          </div>
          <Link
            to={`/history/${session.id}/edit`}
            className="inline-flex items-center gap-1.5 text-sm text-brass hover:underline"
          >
            <Pencil size={14} /> Edit
          </Link>
        </div>
        <p className="text-chalkdim text-sm mt-1">{formatDate(session.date)}</p>
      </div>

      <TrainerComment session={session} effectiveUid={effectiveUid} isAdmin={isAdmin} onSaved={refresh} />

      {session.notes && (
        <Card className="text-sm text-chalkdim italic">"{session.notes}"</Card>
      )}

      {(session.entries || []).map((entry, i) => (
        <Card key={i} className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg">{entry.name}</h3>
              {entry.category === 'cardio' && <Badge tone="cardio">Cardio</Badge>}
              {entry.category !== 'cardio' && entry.bodyweight && <Badge tone="brass">Bodyweight</Badge>}
            </div>
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
                <span className="text-chalkdim me-1">#{j + 1}</span>
                {formatSet(entry, s)}
              </div>
            ))}
          </div>
          {entry.notes && <p className="text-chalkdim text-sm italic">"{entry.notes}"</p>}
        </Card>
      ))}
    </div>
  )
}

function TrainerComment({ session, effectiveUid, isAdmin, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(session.trainer_comment || '')
  const [saving, setSaving] = useState(false)

  // Nothing to show and nobody who can add anything — render nothing at all.
  if (!session.trainer_comment && !isAdmin) return null

  async function save() {
    setSaving(true)
    try {
      await updateTrainerComment(effectiveUid, session.id, text)
      onSaved?.()
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <Card className="flex flex-col gap-2 border-brass/50">
        <span className="eyebrow text-brass flex items-center gap-1.5">
          <MessageSquareText size={13} /> Trainer feedback
        </span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Leave feedback on this session — visible to them, not editable by them."
          rows={3}
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button variant="brass" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : (
              <>
                <Check size={15} /> Save
              </>
            )}
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <Card className="flex items-start justify-between gap-3 border-brass/50">
      <div className="flex items-start gap-2 min-w-0">
        <MessageSquareText size={15} className="text-brass shrink-0 mt-0.5" />
        <div className="min-w-0">
          <span className="eyebrow text-brass">Trainer feedback</span>
          <p className="text-sm mt-0.5">
            {session.trainer_comment || <span className="text-chalkdim italic">No feedback yet.</span>}
          </p>
        </div>
      </div>
      {isAdmin && (
        <button onClick={() => setEditing(true)} className="text-chalkdim hover:text-brass shrink-0 p-1">
          <Pencil size={14} />
        </button>
      )}
    </Card>
  )
}
