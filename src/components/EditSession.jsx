import React, { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ChevronLeft, Check } from 'lucide-react'
import { useAdmin } from '../context/AdminContext.jsx'
import { useCollection, updateSession } from '../lib/db.js'
import { Button, Card, CategoryTag, Field } from './ui.jsx'
import SessionEntryCard from './SessionEntryCard.jsx'

export default function EditSession() {
  const { effectiveUid } = useAdmin()
  const { id } = useParams()
  const navigate = useNavigate()
  const [sessions, loading] = useCollection(effectiveUid, 'sessions', 'date', 'desc')
  const session = sessions.find((s) => s.id === id)

  const [date, setDate] = useState('')
  const [notes, setNotes] = useState('')
  const [entries, setEntries] = useState([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [seeded, setSeeded] = useState(false)

  useEffect(() => {
    if (session && !seeded) {
      setDate(session.date)
      setNotes(session.notes || '')
      setEntries(
        (session.entries || []).map((e) => ({
          ...e,
          sets: (e.sets || []).map((s) => ({ weight: s.weight ?? '', reps: s.reps ?? '' })),
        })),
      )
      setSeeded(true)
    }
  }, [session, seeded])

  function updateSet(entryIdx, setIdx, patch) {
    setEntries((prev) =>
      prev.map((e, i) =>
        i !== entryIdx ? e : { ...e, sets: e.sets.map((s, j) => (j === setIdx ? { ...s, ...patch } : s)) },
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

  async function handleSave() {
    setSaving(true)
    try {
      await updateSession(effectiveUid, id, { date, notes, entries })
      setSaved(true)
      setTimeout(() => navigate(`/history/${id}`), 700)
    } finally {
      setSaving(false)
    }
  }

  if (!loading && !session) return <p className="text-chalkdim">Session not found.</p>
  if (!session) return null

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <Link to={`/history/${id}`} className="text-chalkdim text-sm inline-flex items-center gap-1 hover:text-chalk w-fit">
        <ChevronLeft size={15} /> Back to session
      </Link>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-3xl">Edit session</h1>
          <CategoryTag category={session.category} />
        </div>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-fit" />
      </div>

      {entries.map((entry, i) => (
        <SessionEntryCard
          key={entry.exerciseId + i}
          entry={entry}
          onUpdateSet={(setIdx, patch) => updateSet(i, setIdx, patch)}
          onAddSet={() => addSet(i)}
          onRemoveSet={(setIdx) => removeSet(i, setIdx)}
        />
      ))}

      <Card>
        <Field label="Session notes (optional)">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || saved} variant={saved ? 'subtle' : 'primary'}>
          {saved ? (
            <>
              <Check size={16} /> Saved
            </>
          ) : saving ? (
            'Saving…'
          ) : (
            'Save changes'
          )}
        </Button>
      </div>
    </div>
  )
}
