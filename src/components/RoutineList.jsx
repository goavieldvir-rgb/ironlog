import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Play, Pencil, Trash2, Dumbbell, Copy, Send } from 'lucide-react'
import { useAdmin } from '../context/AdminContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useCollection, deleteRoutine, addRoutine } from '../lib/db.js'
import { loadDraft, clearDraft } from '../lib/draft.js'
import { supabase } from '../supabase.js'
import { Button, Card, CategoryTag, EmptyState } from './ui.jsx'
import { Tabs } from './ExerciseLibrary.jsx'
import { InfoTip } from './InfoTip.jsx'

export default function RoutineList() {
  const { effectiveUid, isAdmin } = useAdmin()
  const { t } = useLanguage()
  const [routines, loading, refresh] = useCollection(effectiveUid, 'routines', 'created_at', 'desc')
  const [exercises] = useCollection(effectiveUid, 'exercises', 'name', 'asc')
  const [tab, setTab] = useState('all')
  const [copyTarget, setCopyTarget] = useState(null)

  const exerciseNameById = useMemo(
    () => Object.fromEntries(exercises.map((e) => [e.id, e.name])),
    [exercises],
  )

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
          <div className="eyebrow mb-1">{t('routines.plan')}</div>
          <h1 className="text-3xl flex items-center gap-2 flex-wrap">
            {t('routines.title')}
            <InfoTip text={t('routines.cardActionsTip')} />
          </h1>
        </div>
        <Link to="/routines/new">
          <Button>
            <Plus size={16} /> {t('routines.buildRoutine')}
          </Button>
        </Link>
      </div>

      <Tabs tab={tab} setTab={setTab} />

      {!loading && filtered.length === 0 && (
        <EmptyState
          title={t('routines.emptyTitle')}
          body={t('routines.emptyBody')}
          action={
            <Link to="/routines/new">
              <Button variant="brass">
                <Plus size={16} /> {t('routines.buildFirst')}
              </Button>
            </Link>
          }
        />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {filtered.map((r) => (
          <Card key={r.id} className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg leading-tight">{r.name}</h3>
                  <CategoryTag category={r.category} />
                </div>
                <p className="text-chalkdim text-xs mt-1">
                  {r.exercises?.length || 0} {t('routines.exercisesCount')}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  className="p-1.5 rounded hover:bg-surface2 text-chalkdim hover:text-chalk"
                  onClick={() => duplicateRoutine(r)}
                  title={t('routines.duplicate')}
                >
                  <Copy size={15} />
                </button>
                {isAdmin && (
                  <button
                    className="p-1.5 rounded hover:bg-brasssoft text-chalkdim hover:text-brass"
                    onClick={() => setCopyTarget(r)}
                    title={t('routines.copyToPerson')}
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
                    if (confirm(t('routines.deleteConfirm')(r.name))) {
                      deleteRoutine(effectiveUid, r.id).then(refresh)
                      const draft = loadDraft(effectiveUid)
                      if (draft?.routineId === r.id) clearDraft(effectiveUid)
                    }
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            <ul className="text-sm text-chalkdim flex flex-col gap-0.5">
              {(r.exercises || []).slice(0, 4).map((e, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span className="text-chalk truncate min-w-0">{exerciseNameById[e.exerciseId] || e.name}</span>
                  <span className="num shrink-0">
                    {r.category === 'cardio'
                      ? `${e.targetSets ?? e.targetDuration ?? ''}${e.targetSets != null ? ' min' : ''}`
                      : `${e.targetSets}×${e.targetReps}`}
                  </span>
                </li>
              ))}
              {(r.exercises?.length || 0) > 4 && <li>{t('routines.moreCount')(r.exercises.length - 4)}</li>}
            </ul>

            <Link to={`/workout/${r.id}`} className="mt-1">
              <Button variant="brass" className="w-full">
                <Play size={15} /> {t('routines.startSession')}
              </Button>
            </Link>
          </Card>
        ))}
      </div>

      <Link to="/workout/freestyle" className="text-chalkdim text-sm inline-flex items-center gap-1.5 hover:text-chalk w-fit">
        <Dumbbell size={14} /> {t('routines.freestyleLink')}
      </Link>

      {copyTarget && <CopyToPersonModal routine={copyTarget} onClose={() => setCopyTarget(null)} />}
    </div>
  )
}

function CopyToPersonModal({ routine, onClose }) {
  const { t } = useLanguage()
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
        <h2 className="text-xl mb-1">{t('routines.copyModalTitle')(routine.name)}</h2>
        <p className="text-chalkdim text-sm mb-4">{t('routines.copyModalSubtitle')}</p>

        <div className="flex flex-col gap-1 max-h-72 overflow-y-auto">
          {loading && <p className="text-chalkdim text-sm py-2">{t('common.loading')}</p>}
          {people.map((p) => (
            <button
              key={p.id}
              onClick={() => copyTo(p)}
              disabled={copiedTo === p.id}
              className="flex items-center justify-between gap-2 px-2 py-2 rounded-md hover:bg-surface2 text-start disabled:opacity-50"
            >
              <span className="truncate min-w-0">{p.full_name || p.email}</span>
              <span className="text-xs text-brass shrink-0">{copiedTo === p.id ? t('routines.copiedLabel') : t('routines.copyHereLabel')}</span>
            </button>
          ))}
        </div>

        <div className="flex justify-end mt-4 pt-4 border-t border-line">
          <Button variant="ghost" onClick={onClose}>
            {t('common.done')}
          </Button>
        </div>
      </div>
    </div>
  )
}
