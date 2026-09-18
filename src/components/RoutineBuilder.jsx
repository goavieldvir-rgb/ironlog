import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { Plus, Trash2, ArrowUp, ArrowDown, Library } from 'lucide-react'
import { BackChevron } from './DirectionalIcon.jsx'
import { useAdmin } from '../context/AdminContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useCollection, addRoutine, updateRoutine, addExercise } from '../lib/db.js'
import { Button, Card, Field } from './ui.jsx'
import ExercisePicker from './ExercisePicker.jsx'
import { ExerciseModal, emptyExerciseForm } from './ExerciseLibrary.jsx'
import { InfoTip } from './InfoTip.jsx'
import { disambiguateLabels } from '../lib/disambiguate.js'

export default function RoutineBuilder() {
  const { effectiveUid } = useAdmin()
  const { t, lang } = useLanguage()
  const { id } = useParams()
  const navigate = useNavigate()
  const [exercises, , refreshExercises] = useCollection(effectiveUid, 'exercises', 'name', 'asc')
  const [routines, loading] = useCollection(effectiveUid, 'routines', 'created_at', 'desc')
  const [picking, setPicking] = useState(false)
  const [creatingCustom, setCreatingCustom] = useState(false)

  const existing = useMemo(() => routines.find((r) => r.id === id), [routines, id])

  const [name, setName] = useState('')
  const [category, setCategory] = useState('strength')
  const [items, setItems] = useState([])
  const [pickId, setPickId] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (existing) {
      setName(existing.name)
      setCategory(existing.category)
      setItems(existing.exercises || [])
    }
  }, [existing])

  const availableExercises = exercises.filter((e) => e.category === category)
  const availableExerciseLabels = disambiguateLabels(availableExercises, (e) => (lang === 'he' && e.name_he) || e.name, t)
  const isCardio = category === 'cardio'
  const categoryLabel = { strength: t('tabs.strength'), mobility: t('tabs.mobility'), cardio: t('tabs.cardio') }[category]

  function makeItem(ex) {
    if (isCardio) {
      return {
        exerciseId: ex.id,
        name: ex.name,
        unit: ex.unit,
        category: 'cardio',
        intensityType: ex.intensity_type || ex.intensityType || 'rpe',
        videoUrl: ex.video_url || ex.videoUrl || '',
        targetDuration: 20,
        targetIntensity: ex.intensity_type === 'hr_zone' ? 3 : 5,
      }
    }
    return {
      exerciseId: ex.id,
      name: ex.name,
      unit: ex.unit,
      bodyweight: !!ex.bodyweight,
      videoUrl: ex.video_url || ex.videoUrl || '',
      targetSets: 3,
      targetReps: 10,
    }
  }

  function addItem() {
    const ex = exercises.find((e) => e.id === pickId)
    if (!ex) return
    setItems([...items, makeItem(ex)])
    setPickId('')
  }

  async function addFromLibrary(g) {
    let ex = exercises.find((e) => e.name.toLowerCase() === g.name.toLowerCase())
    if (!ex) {
      ex = await addExercise(effectiveUid, {
        name: g.name,
        nameHe: g.nameHe,
        category: g.category,
        unit: g.unit,
        bodyweight: g.bodyweight,
        intensityType: g.intensity_type,
        videoUrl: '',
        notes: '',
      })
      refreshExercises()
    }
    setItems((prev) => [...prev, makeItem(ex)])
  }

  function updateItem(i, patch) {
    setItems(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  }

  function removeItem(i) {
    setItems(items.filter((_, idx) => idx !== i))
  }

  function move(i, dir) {
    const j = i + dir
    if (j < 0 || j >= items.length) return
    const copy = [...items]
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
    setItems(copy)
  }

  async function handleSave() {
    if (!name.trim() || items.length === 0) return
    setSaving(true)
    try {
      const payload = { name: name.trim(), category, exercises: items }
      if (id) {
        await updateRoutine(effectiveUid, id, payload)
      } else {
        await addRoutine(effectiveUid, payload)
      }
      navigate('/routines')
    } finally {
      setSaving(false)
    }
  }

  if (id && !loading && !existing) {
    return <p className="text-chalkdim">{t('routines.notFound')}</p>
  }

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <Link to="/routines" className="text-chalkdim text-sm inline-flex items-center gap-1 hover:text-chalk w-fit">
        <BackChevron size={15} /> {t('routines.title')}
      </Link>

      <h1 className="text-3xl">{id ? t('routines.editTitle') : t('routines.buildTitle')}</h1>

      <Card className="flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t('routines.routineName')}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('routines.routineNamePlaceholder')} required />
          </Field>
          <Field
            label={
              <>
                {t('routines.category')} <InfoTip text={t('routines.categoryTip')} />
              </>
            }
          >
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="strength">{t('tabs.strength')}</option>
              <option value="mobility">{t('exercises.catMobility')}</option>
              <option value="cardio">{t('tabs.cardio')}</option>
            </select>
          </Field>
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="eyebrow">{t('routines.exercisesInRoutine')}</h2>

        {items.length === 0 && (
          <p className="text-chalkdim text-sm">{t('routines.noExercisesAdded')}</p>
        )}

        <div className="flex flex-col gap-2">
          {items.map((it, i) => (
            <div key={i} className="flex items-center gap-2 bg-surface2 rounded-md p-2.5 flex-wrap">
              <div className="flex-1 min-w-0">
                <p className="truncate">
                  {(() => {
                    const found = exercises.find((e) => e.id === it.exerciseId)
                    return (lang === 'he' && found?.name_he) || found?.name || it.name
                  })()}
                </p>
              </div>
              {isCardio ? (
                <>
                  <input
                    type="number"
                    min={1}
                    value={it.targetDuration ?? 20}
                    onChange={(e) => updateItem(i, { targetDuration: Number(e.target.value) })}
                    className="w-16 text-center num"
                    title={t('routines.targetDuration')}
                  />
                  <span className="text-chalkdim text-xs">{t('routines.minLabel')}</span>
                  <input
                    type="number"
                    min={1}
                    value={it.targetIntensity ?? 5}
                    onChange={(e) => updateItem(i, { targetIntensity: Number(e.target.value) })}
                    className="w-14 text-center num"
                    title={it.intensityType === 'hr_zone' ? t('routines.targetHrZone') : t('routines.targetIntensity')}
                  />
                  <span className="text-chalkdim text-xs">{it.intensityType === 'hr_zone' ? t('exercises.hrZone') : t('exercises.rpe')}</span>
                </>
              ) : (
                <>
                  <input
                    type="number"
                    min={1}
                    value={it.targetSets}
                    onChange={(e) => updateItem(i, { targetSets: Number(e.target.value) })}
                    className="w-14 text-center num"
                    title={t('routines.targetSets')}
                  />
                  <span className="text-chalkdim text-xs">×</span>
                  <input
                    value={it.targetReps}
                    onChange={(e) => updateItem(i, { targetReps: e.target.value })}
                    className="w-16 text-center num"
                    title={t('routines.targetReps')}
                    placeholder="10"
                  />
                </>
              )}
              <div className="flex flex-col">
                <button onClick={() => move(i, -1)} className="text-chalkdim hover:text-chalk disabled:opacity-30" disabled={i === 0}>
                  <ArrowUp size={13} />
                </button>
                <button
                  onClick={() => move(i, 1)}
                  className="text-chalkdim hover:text-chalk disabled:opacity-30"
                  disabled={i === items.length - 1}
                >
                  <ArrowDown size={13} />
                </button>
              </div>
              <button onClick={() => removeItem(i)} className="text-chalkdim hover:text-iron p-1">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-2 items-end pt-2 border-t border-line flex-wrap">
          <Field label={t('routines.yourExercisesLabel')(categoryLabel)}>
            <select value={pickId} onChange={(e) => setPickId(e.target.value)} className="w-56">
              <option value="">{t('routines.chooseAlreadyAdded')}</option>
              {availableExercises.map((e, i) => (
                <option key={e.id} value={e.id}>
                  {availableExerciseLabels[i]}
                </option>
              ))}
            </select>
          </Field>
          <Button type="button" variant="ghost" onClick={addItem} disabled={!pickId}>
            <Plus size={16} /> {t('common.add')}
          </Button>
          <Button type="button" variant="brass" onClick={() => setPicking(true)}>
            <Library size={16} /> {t('routines.browseLibrary')}
          </Button>
        </div>
        {availableExercises.length === 0 && (
          <p className="text-chalkdim text-xs">{t('routines.nothingInList')(categoryLabel)}</p>
        )}
      </Card>

      {picking && (
        <ExercisePicker
          existingNames={exercises.map((e) => e.name)}
          onAdd={addFromLibrary}
          lockCategory={category}
          onCreateCustom={() => {
            setPicking(false)
            setCreatingCustom(true)
          }}
          onClose={() => setPicking(false)}
        />
      )}

      {creatingCustom && (
        <ExerciseModal
          initial={{ ...emptyExerciseForm, category }}
          onClose={() => setCreatingCustom(false)}
          onSave={async (data) => {
            const ex = await addExercise(effectiveUid, data)
            refreshExercises()
            setItems((prev) => [...prev, makeItem(ex)])
            setCreatingCustom(false)
          }}
        />
      )}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => navigate('/routines')}>
          {t('common.cancel')}
        </Button>
        <Button onClick={handleSave} disabled={saving || !name.trim() || items.length === 0}>
          {saving ? t('common.saving') : t('routines.saveRoutine')}
        </Button>
      </div>
    </div>
  )
}
