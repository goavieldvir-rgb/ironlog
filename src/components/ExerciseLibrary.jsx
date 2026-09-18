import React, { useMemo, useState } from 'react'
import { Plus, Play, Pencil, Trash2, Lock } from 'lucide-react'
import { useAdmin } from '../context/AdminContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useCollection, addExercise, updateExercise, deleteExercise } from '../lib/db.js'
import { Button, Card, CategoryTag, Badge, EmptyState, Field } from './ui.jsx'
import ExercisePicker from './ExercisePicker.jsx'
import { InfoTip } from './InfoTip.jsx'

export const emptyExerciseForm = {
  name: '',
  category: 'strength',
  videoUrl: '',
  notes: '',
  unit: 'kg',
  bodyweight: false,
  intensityType: 'rpe',
}

function formatLast(ex, t) {
  if (ex.last_weight == null) return null
  if (ex.category === 'cardio') {
    const dist = ex.last_distance != null ? ` · ${ex.last_distance}${ex.unit}` : ''
    const intensityLabel = ex.intensity_type === 'hr_zone' ? `${t('exercises.hrZone')} ${ex.last_reps}` : `${t('exercises.rpe')} ${ex.last_reps}`
    return `${t('exercises.lastPrefix')} ${ex.last_weight} min · ${intensityLabel}${dist}`
  }
  if (ex.bodyweight) {
    const added = Number(ex.last_weight) > 0 ? `+${ex.last_weight}${ex.unit} ` : ''
    return `${t('exercises.lastPrefix')} ${added}${t('exercises.bodyweightWord')} × ${ex.last_reps}`
  }
  return `${t('exercises.lastPrefix')} ${ex.last_weight}${ex.unit} × ${ex.last_reps}`
}

export default function ExerciseLibrary() {
  const { effectiveUid } = useAdmin()
  const { t, lang } = useLanguage()
  const [exercises, loading, refresh] = useCollection(effectiveUid, 'exercises', 'name', 'asc')
  const [sessions] = useCollection(effectiveUid, 'sessions', 'date', 'desc')
  const [tab, setTab] = useState('all')
  const [editing, setEditing] = useState(null)
  const [picking, setPicking] = useState(false)
  const [q, setQ] = useState('')

  // An exercise is "locked" (its tracking method can't change) once it's
  // actually been logged at least once — that's what makes past numbers
  // meaningful to compare. Brand-new, never-used exercises stay fully
  // editable.
  const usedExerciseIds = useMemo(() => {
    const ids = new Set()
    for (const s of sessions) {
      for (const e of s.entries || []) {
        if (e.exerciseId) ids.add(e.exerciseId)
      }
    }
    return ids
  }, [sessions])

  const filtered = useMemo(() => {
    return exercises.filter((e) => {
      if (tab !== 'all' && e.category !== tab) return false
      if (q && !e.name.toLowerCase().includes(q.toLowerCase())) return false
      return true
    })
  }, [exercises, tab, q])

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="eyebrow mb-1">{t('exercises.library')}</div>
          <h1 className="text-3xl">{t('exercises.title')}</h1>
        </div>
        <Button onClick={() => setPicking(true)}>
          <Plus size={16} /> {t('exercises.addExercise')}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 justify-between">
        <Tabs tab={tab} setTab={setTab} />
        <input
          placeholder={t('exercises.searchPlaceholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full sm:w-56"
        />
      </div>

      {!loading && filtered.length === 0 && (
        <EmptyState
          title={t('exercises.emptyTitle')}
          body={t('exercises.emptyBody')}
          action={
            <Button variant="brass" onClick={() => setPicking(true)}>
              <Plus size={16} /> {t('exercises.addFirst')}
            </Button>
          }
        />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {filtered.map((ex) => (
          <Card key={ex.id} className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg leading-tight">{(lang === 'he' && ex.name_he) || ex.name}</h3>
                  <CategoryTag category={ex.category} />
                  {ex.bodyweight && ex.category !== 'cardio' && <Badge tone="brass">{t('exercises.bodyweightBadge')}</Badge>}
                  {ex.category === 'cardio' && (
                    <Badge tone="cardio">{ex.intensity_type === 'hr_zone' ? t('exercises.hrZone') : t('exercises.rpe')}</Badge>
                  )}
                </div>
                {formatLast(ex, t) && <p className="num text-chalkdim text-xs mt-1">{formatLast(ex, t)}</p>}
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  className="p-1.5 rounded hover:bg-surface2 text-chalkdim hover:text-chalk"
                  onClick={() => setEditing({ ...ex, videoUrl: ex.video_url, intensityType: ex.intensity_type })}
                  title={t('common.edit')}
                >
                  <Pencil size={15} />
                </button>
                <button
                  className="p-1.5 rounded hover:bg-ironsoft text-chalkdim hover:text-iron"
                  onClick={() => {
                    if (confirm(t('exercises.deleteConfirm')(ex.name))) {
                      deleteExercise(effectiveUid, ex.id).then(refresh)
                    }
                  }}
                  title={t('common.delete')}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            {ex.notes && <p className="text-chalkdim text-sm">{ex.notes}</p>}
            {ex.video_url && (
              <a
                href={ex.video_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-brass hover:underline w-fit"
              >
                <Play size={14} /> {t('exercises.watchExample')}
              </a>
            )}
          </Card>
        ))}
      </div>

      {picking && (
        <ExercisePicker
          existingNames={exercises.map((e) => e.name)}
          onAdd={async (g) => {
            await addExercise(effectiveUid, {
              name: g.name,
              nameHe: g.nameHe,
              category: g.category,
              unit: g.unit,
              bodyweight: g.bodyweight,
              intensityType: g.intensity_type,
              videoUrl: '',
              notes: '',
            })
            refresh()
          }}
          onCreateCustom={() => {
            setPicking(false)
            setEditing(emptyExerciseForm)
          }}
          onClose={() => setPicking(false)}
        />
      )}

      {editing && (
        <ExerciseModal
          key={editing.id || 'new'}
          initial={editing}
          hasHistory={editing.id ? usedExerciseIds.has(editing.id) : false}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            if (editing.id) {
              await updateExercise(effectiveUid, editing.id, data)
            } else {
              await addExercise(effectiveUid, data)
            }
            refresh()
            setEditing(null)
          }}
          onCreateVariant={(currentForm) => {
            // Keep the name/video/notes as a starting point, but drop the
            // id (so this becomes a genuinely new exercise) and leave
            // category/tracking fields exactly as they are — unlocked,
            // since this "new" exercise has no history yet — so the person
            // can immediately change whichever one they actually came here
            // to change.
            setEditing({
              ...emptyExerciseForm,
              name: currentForm.name,
              videoUrl: currentForm.videoUrl,
              notes: currentForm.notes,
              category: currentForm.category,
              unit: currentForm.unit,
              bodyweight: currentForm.bodyweight,
              intensityType: currentForm.intensityType,
            })
          }}
        />
      )}
    </div>
  )
}

export function Tabs({ tab, setTab }) {
  const { t } = useLanguage()
  const opts = [
    { id: 'all', label: t('tabs.all') },
    { id: 'strength', label: t('tabs.strength') },
    { id: 'mobility', label: t('tabs.mobility') },
    { id: 'cardio', label: t('tabs.cardio') },
  ]
  return (
    <div className="flex rounded-md bg-surface2 p-1 text-sm w-fit flex-wrap">
      {opts.map((o) => (
        <button
          key={o.id}
          onClick={() => setTab(o.id)}
          className={`px-3 py-1.5 rounded transition-colors ${
            tab === o.id ? 'bg-ink text-chalk' : 'text-chalkdim'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function ExerciseModal({ initial, onClose, onSave, hasHistory = false, onCreateVariant }) {
  const { t } = useLanguage()
  const [form, setForm] = useState({ ...emptyExerciseForm, ...initial })
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave(form)
    } finally {
      setSaving(false)
    }
  }

  const isCardio = form.category === 'cardio'
  const locked = hasHistory && !!initial.id

  return (
    <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm z-30 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card p-6 w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-2xl mb-4">{initial.id ? t('exercises.editExercise') : t('exercises.newExercise')}</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label={t('exercises.name')}>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t('exercises.namePlaceholder')}
              required
              autoFocus
            />
          </Field>

          {locked && (
            <div className="bg-surface2 rounded-md p-3 flex flex-col gap-2">
              <p className="text-chalkdim text-sm inline-flex items-start gap-1.5">
                <Lock size={14} className="shrink-0 mt-0.5" />
                {t('exercises.lockedExplanation')}
              </p>
              {onCreateVariant && (
                <Button type="button" variant="ghost" onClick={() => onCreateVariant(form)} className="w-fit">
                  {t('exercises.createVariant')}
                </Button>
              )}
            </div>
          )}

          <Field label={t('exercises.category')}>
            <select
              value={form.category}
              disabled={locked}
              onChange={(e) => {
                const category = e.target.value
                setForm({
                  ...form,
                  category,
                  unit: category === 'cardio' ? 'km' : form.unit === 'km' || form.unit === 'mi' ? 'kg' : form.unit,
                })
              }}
            >
              <option value="strength">{t('exercises.catStrength')}</option>
              <option value="mobility">{t('exercises.catMobility')}</option>
              <option value="cardio">{t('exercises.catCardio')}</option>
            </select>
          </Field>

          {!isCardio && (
            <>
              <Field
                label={
                  <>
                    {t('exercises.weightTrackedLabel')} <InfoTip text={t('exercises.weightTrackedTip')} />
                  </>
                }
              >
                <select
                  value={form.bodyweight ? 'bodyweight' : form.unit}
                  disabled={locked}
                  onChange={(e) => {
                    const v = e.target.value
                    if (v === 'bodyweight') setForm({ ...form, bodyweight: true })
                    else setForm({ ...form, bodyweight: false, unit: v })
                  }}
                >
                  <option value="kg">{t('exercises.optKg')}</option>
                  <option value="lb">{t('exercises.optLb')}</option>
                  <option value="bodyweight">{t('exercises.optBodyweight')}</option>
                </select>
              </Field>

              {form.bodyweight && (
                <Field label={t('exercises.addedWeightUnit')}>
                  <select value={form.unit} disabled={locked} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                    <option value="kg">kg</option>
                    <option value="lb">{t('exercises.optLbShort')}</option>
                  </select>
                </Field>
              )}
            </>
          )}

          {isCardio && (
            <>
              <Field
                label={
                  <>
                    {t('exercises.intensityLabel')} <InfoTip text={t('exercises.intensityTip')} />
                  </>
                }
              >
                <select value={form.intensityType} disabled={locked} onChange={(e) => setForm({ ...form, intensityType: e.target.value })}>
                  <option value="rpe">{t('exercises.optRpe')}</option>
                  <option value="hr_zone">{t('exercises.optHrZone')}</option>
                </select>
              </Field>
              <Field label={t('exercises.distanceUnit')}>
                <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                  <option value="km">{t('exercises.optKm')}</option>
                  <option value="mi">{t('exercises.optMi')}</option>
                </select>
              </Field>
            </>
          )}

          <Field label={t('exercises.videoLink')}>
            <input
              type="url"
              dir="ltr"
              value={form.videoUrl}
              onChange={(e) => setForm({ ...form, videoUrl: e.target.value })}
              placeholder={t('exercises.videoPlaceholder')}
            />
          </Field>

          <Field label={t('exercises.notes')}>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder={t('exercises.notesPlaceholder')}
              rows={2}
            />
          </Field>

          <div className="flex gap-2 justify-end mt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
