import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { Plus, Trash2, ArrowUp, ArrowDown, Library, Video } from 'lucide-react'
import { BackChevron } from './DirectionalIcon.jsx'
import { useAdmin } from '../context/AdminContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFeedback } from '../context/FeedbackContext.jsx'
import { useCollection, addRoutine, updateRoutine, addExercise, updateExercise } from '../lib/db.js'
import { Button, Card, Field } from './ui.jsx'
import ExercisePicker from './ExercisePicker.jsx'
import ExerciseSelect from './ExerciseSelect.jsx'
import { normalizeVideoUrl } from '../lib/url.js'
import { ExerciseModal, emptyExerciseForm } from './ExerciseLibrary.jsx'
import { InfoTip } from './InfoTip.jsx'
import { disambiguateLabels } from '../lib/disambiguate.js'
import { useScrollLock } from '../lib/scrollLock.js'

export default function RoutineBuilder() {
  const { effectiveUid } = useAdmin()
  const { t, lang } = useLanguage()
  const { toast } = useFeedback()
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

  // Bulk-toggles RIR tracking for every strength/bodyweight exercise
  // currently in this routine (cardio already has its own effort metric,
  // so it's excluded) — updates each exercise's own setting, same as
  // toggling it individually in Exercises, just all at once.
  const rirEligibleIds = [...new Set(items.filter((it) => it.category !== 'cardio').map((it) => it.exerciseId))]
  const rirEligibleExercises = rirEligibleIds.map((id) => exercises.find((e) => e.id === id)).filter(Boolean)
  const allRirOn = rirEligibleExercises.length > 0 && rirEligibleExercises.every((e) => e.track_rir)

  // Demo videos belong to the exercise, not to this routine — setting one
  // here updates the exercise itself, so it shows up everywhere that
  // exercise appears (while logging, in past sessions, in My exercises).
  const [videoFor, setVideoFor] = useState(null)
  const [videoUrl, setVideoUrl] = useState('')
  const [videoSaving, setVideoSaving] = useState(false)
  useScrollLock(videoFor != null)

  function openVideo(exerciseId) {
    const ex = exercises.find((e) => e.id === exerciseId)
    setVideoUrl(ex?.video_url || '')
    setVideoFor(exerciseId)
  }

  async function saveVideo() {
    setVideoSaving(true)
    try {
      await updateExercise(effectiveUid, videoFor, { videoUrl: normalizeVideoUrl(videoUrl) })
      refreshExercises()
      setVideoFor(null)
      toast(t('feedback.saved'))
    } catch (err) {
      console.error(err)
      toast(t('feedback.saveFailed'), 'error')
    } finally {
      setVideoSaving(false)
    }
  }

  async function setRirForRoutine(enable) {
    try {
      await Promise.all(rirEligibleIds.map((id) => updateExercise(effectiveUid, id, { trackRir: enable })))
      toast(enable ? t('routines.rirOnDone') : t('routines.rirOffDone'))
    } catch (err) {
      console.error(err)
      toast(t('feedback.saveFailed'), 'error')
    } finally {
      refreshExercises()
    }
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
      toast(t('feedback.saved'))
      navigate('/routines')
    } catch (err) {
      console.error(err)
      toast(t('feedback.saveFailed'), 'error')
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

        {rirEligibleIds.length > 0 && (
          <div className="flex items-center justify-between gap-2 flex-wrap bg-surface2 rounded-md p-2.5">
            <span className="text-sm text-chalkdim inline-flex items-center gap-1">
              {t('routines.rirForAll')} <InfoTip text={t('routines.rirForAllTip')} />
            </span>
            <Button type="button" variant="ghost" onClick={() => setRirForRoutine(!allRirOn)}>
              {allRirOn ? t('routines.rirTurnOff') : t('routines.rirTurnOn')}
            </Button>
          </div>
        )}

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
              <button
                type="button"
                onClick={() => openVideo(it.exerciseId)}
                title={t('routines.videoFor')} aria-label={t('routines.videoFor')}
                className={`p-1.5 rounded hover:bg-ink shrink-0 ${
                  exercises.find((e) => e.id === it.exerciseId)?.video_url ? 'text-brass' : 'text-chalkdim hover:text-chalk'
                }`}
              >
                <Video size={15} />
              </button>
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
                <button onClick={() => move(i, -1)} aria-label={t('sessionCard.moveUp')} className="text-chalkdim hover:text-chalk disabled:opacity-30" disabled={i === 0}>
                  <ArrowUp size={13} />
                </button>
                <button
                  onClick={() => move(i, 1)}
                  aria-label={t('sessionCard.moveDown')}
                  className="text-chalkdim hover:text-chalk disabled:opacity-30"
                  disabled={i === items.length - 1}
                >
                  <ArrowDown size={13} />
                </button>
              </div>
              <button onClick={() => removeItem(i)} aria-label={t('common.remove')} className="text-chalkdim hover:text-iron p-1">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-2 items-end pt-2 border-t border-line flex-wrap">
          <Field label={t('routines.yourExercisesLabel')(categoryLabel)}>
            <ExerciseSelect
              value={pickId}
              onChange={setPickId}
              options={availableExercises.map((e, i) => ({ id: e.id, label: availableExerciseLabels[i] }))}
              placeholder={t('routines.chooseAlreadyAdded')}
              className="w-full sm:w-72"
            />
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

      {videoFor && (
        <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm z-30 flex items-center justify-center p-4" onClick={() => setVideoFor(null)}>
          <div className="card p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl mb-1">{t('routines.videoTitle')}</h2>
            <p className="text-chalkdim text-sm mb-4">{t('routines.videoBody')}</p>
            <Field label={t('exercises.videoLink')}>
              <input
                type="text"
                inputMode="url"
                dir="ltr"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder={t('exercises.videoPlaceholder')}
                className="w-full"
              />
            </Field>
            {normalizeVideoUrl(videoUrl) && (
              <a href={normalizeVideoUrl(videoUrl)} target="_blank" rel="noreferrer" className="text-brass text-sm hover:underline mt-2 inline-block">
                {t('routines.videoPreview')}
              </a>
            )}
            <div className="flex justify-end gap-2 mt-5">
              <Button type="button" variant="ghost" onClick={() => setVideoFor(null)}>
                {t('common.cancel')}
              </Button>
              <Button type="button" onClick={saveVideo} disabled={videoSaving}>
                {t('common.save')}
              </Button>
            </div>
          </div>
        </div>
      )}

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
          existingExercises={exercises}
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
