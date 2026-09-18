import React, { useState } from 'react'
import { Play, Plus, Trash2, Minus, CornerDownLeft, History, StickyNote, ChevronDown } from 'lucide-react'
import { Card, Badge } from './ui.jsx'
import { InfoTip } from './InfoTip.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'

function Stepper({ value, onChange, step, min = 0, max }) {
  function bump(delta) {
    const current = Number(value) || 0
    let next = Math.max(min, Math.round((current + delta) * 100) / 100)
    if (max != null) next = Math.min(max, next)
    onChange(String(next))
  }
  return (
    <div className="flex items-stretch min-w-0">
      <button
        type="button"
        onClick={() => bump(-step)}
        className="px-1 shrink-0 rounded-s-md bg-surface2 text-chalkdim hover:text-chalk border border-line border-e-0"
      >
        <Minus size={11} />
      </button>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="num text-center !rounded-none !px-0.5 min-w-0 w-full"
      />
      <button
        type="button"
        onClick={() => bump(step)}
        className="px-1 shrink-0 rounded-e-md bg-surface2 text-chalkdim hover:text-chalk border border-line border-s-0"
      >
        <Plus size={11} />
      </button>
    </div>
  )
}

export default function SessionEntryCard({
  entry,
  onUpdateSet,
  onAddSet,
  onRemoveSet,
  onRemoveEntry,
  onUpdateNote,
  removable = false,
}) {
  const { t } = useLanguage()
  const [showNote, setShowNote] = useState(!!entry.notes)
  const [showQuickFill, setShowQuickFill] = useState(false)
  const isCardio = entry.category === 'cardio'
  const weightStep = entry.unit === 'lb' ? 5 : 2.5
  const intensityMax = entry.intensityType === 'hr_zone' ? 5 : 10
  const intensityLabel = entry.intensityType === 'hr_zone' ? t('exercises.hrZone') : t('exercises.rpe')
  const distanceUnit = entry.unit === 'mi' ? 'mi' : 'km'

  function copyFromPrevious(setIdx) {
    const prev = entry.sets[setIdx - 1]
    if (!prev) return
    if (isCardio) onUpdateSet(setIdx, { duration: prev.duration, intensity: prev.intensity, distance: prev.distance })
    else onUpdateSet(setIdx, { weight: prev.weight, reps: prev.reps })
  }

  // Last time's sets, if we have the full breakdown (added once someone
  // logs a session after this feature shipped). "Last set" is whichever
  // set was done last (reverse-pyramid friendly); "top set" is the
  // heaviest/longest one, wherever in the session it fell (pyramid
  // friendly). Falls back to the single last-known value for older data.
  const lastSets = entry.lastSets || []
  const lastSetData = lastSets.length > 0 ? lastSets[lastSets.length - 1] : null
  const topSetData = (() => {
    if (lastSets.length === 0) return null
    if (isCardio) return lastSets.reduce((best, s) => (Number(s.duration) > Number(best.duration) ? s : best))
    if (entry.bodyweight) return lastSets.reduce((best, s) => (Number(s.reps) > Number(best.reps) ? s : best))
    return lastSets.reduce((best, s) => (Number(s.weight) > Number(best.weight) ? s : best))
  })()
  const hasChoice = lastSetData && topSetData && JSON.stringify(lastSetData) !== JSON.stringify(topSetData)
  const hasAnyLastData = lastSetData != null || entry.lastWeight != null

  function applySet(setIdx, data) {
    if (isCardio) {
      onUpdateSet(setIdx, {
        duration: String(data.duration),
        intensity: String(data.intensity),
        distance: data.distance != null && data.distance !== '' ? String(data.distance) : '',
      })
    } else {
      onUpdateSet(setIdx, { weight: String(data.weight), reps: String(data.reps) })
    }
  }

  function useLastTime(setIdx) {
    if (hasChoice) {
      setShowQuickFill((v) => !v)
      return
    }
    const data =
      lastSetData ||
      (isCardio
        ? { duration: entry.lastWeight, intensity: entry.lastReps, distance: entry.lastDistance }
        : { weight: entry.lastWeight, reps: entry.lastReps })
    applySet(setIdx, data)
  }

  function pickQuickFill(setIdx, data) {
    applySet(setIdx, data)
    setShowQuickFill(false)
  }

  function formatQuickFillLabel(data) {
    if (isCardio) {
      const dist = data.distance != null && data.distance !== '' ? ` · ${data.distance}${distanceUnit}` : ''
      return `${data.duration} ${t('sessionCard.minUnit')} · ${intensityLabel} ${data.intensity}${dist}`
    }
    return `${data.weight}${entry.unit} × ${data.reps}`
  }

  const prevLabel = (() => {
    if (entry.lastWeight == null) return null
    if (isCardio) {
      const dist = entry.lastDistance != null ? ` · ${entry.lastDistance}${distanceUnit}` : ''
      return `${t('sessionCard.previously')} ${entry.lastWeight} ${t('sessionCard.minUnit')} · ${intensityLabel} ${entry.lastReps}${dist}`
    }
    if (entry.bodyweight) {
      const added = Number(entry.lastWeight) > 0 ? `+${entry.lastWeight}${entry.unit} ` : ''
      return `${t('sessionCard.previously')} ${added}${t('sessionCard.bodyweightBadge')} × ${entry.lastReps}`
    }
    return `${t('sessionCard.previously')} ${entry.lastWeight}${entry.unit} × ${entry.lastReps}`
  })()

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg">{entry.name}</h3>
            {isCardio && <Badge tone="cardio">{t('sessionCard.cardioBadge')}</Badge>}
            {!isCardio && entry.bodyweight && <Badge tone="brass">{t('sessionCard.bodyweightBadge')}</Badge>}
          </div>
          {prevLabel && (
            <p className="num text-chalkdim text-xs mt-0.5 inline-flex items-center gap-1 flex-wrap">
              {prevLabel}
              <InfoTip text={t('sessionCard.previousTip')} />
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onUpdateNote && !showNote && (
            <button
              onClick={() => setShowNote(true)}
              title={t('sessionCard.addNote')}
              className="text-chalkdim hover:text-brass p-1"
            >
              <StickyNote size={15} />
            </button>
          )}
          {entry.videoUrl && (
            <a
              href={entry.videoUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-brass hover:underline"
            >
              <Play size={13} /> {t('sessionCard.example')}
            </a>
          )}
          {removable && (
            <button onClick={onRemoveEntry} className="text-chalkdim hover:text-iron">
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      {showQuickFill && hasChoice && (
        <div className="flex flex-col gap-1.5 bg-surface2 rounded-md p-2.5 -mt-1">
          <span className="eyebrow">{t('sessionCard.copyInNumbers')}</span>
          <div className="flex flex-col sm:flex-row gap-1.5">
            <button
              onClick={() => pickQuickFill(0, lastSetData)}
              className="flex-1 text-start rounded-md bg-ink border border-line hover:border-brass px-3 py-2"
            >
              <p className="text-xs text-chalkdim">{t('sessionCard.lastSetDone')}</p>
              <p className="num text-sm">{formatQuickFillLabel(lastSetData)}</p>
            </button>
            <button
              onClick={() => pickQuickFill(0, topSetData)}
              className="flex-1 text-start rounded-md bg-ink border border-line hover:border-brass px-3 py-2"
            >
              <p className="text-xs text-chalkdim">{t('sessionCard.topSetDone')}</p>
              <p className="num text-sm">{formatQuickFillLabel(topSetData)}</p>
            </button>
          </div>
        </div>
      )}

      {isCardio ? (
        <div className="flex flex-col gap-1.5">
          <div className="grid grid-cols-[1.2rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_3.25rem] gap-1 text-chalkdim eyebrow px-0.5">
            <span>#</span>
            <span className="truncate">{t('sessionCard.min')}</span>
            <span className="truncate">{intensityLabel}</span>
            <span className="truncate">{distanceUnit} {t('sessionCard.opt')}</span>
            <InfoTip text={t('sessionCard.copyAboveTip')} />
          </div>
          {entry.sets.map((s, j) => (
            <div key={j} className="grid grid-cols-[1.2rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_3.25rem] gap-1 items-center">
              <span className="num text-chalkdim text-sm">{j + 1}</span>
              <Stepper value={s.duration} step={1} min={0} onChange={(v) => onUpdateSet(j, { duration: v })} />
              <Stepper
                value={s.intensity}
                step={1}
                min={1}
                max={intensityMax}
                onChange={(v) => onUpdateSet(j, { intensity: v })}
              />
              <Stepper value={s.distance} step={0.1} min={0} onChange={(v) => onUpdateSet(j, { distance: v })} />
              <div className="flex items-center gap-0.5 justify-end min-w-0">
                {j === 0 && hasAnyLastData ? (
                  <button
                    onClick={() => useLastTime(j)}
                    title={hasChoice ? t('sessionCard.chooseLastTime') : t('sessionCard.useLastTime')}
                    className="text-chalkdim hover:text-brass p-1 inline-flex items-center"
                  >
                    <History size={14} />
                    {hasChoice && <ChevronDown size={10} />}
                  </button>
                ) : j > 0 ? (
                  <button onClick={() => copyFromPrevious(j)} title={t('sessionCard.sameAsAbove')} className="text-chalkdim hover:text-brass p-1">
                    <CornerDownLeft size={14} />
                  </button>
                ) : (
                  <span className="w-6" />
                )}
                <button onClick={() => onRemoveSet(j)} className="text-chalkdim hover:text-iron p-1">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          <button onClick={onAddSet} className="text-chalkdim hover:text-chalk text-xs inline-flex items-center gap-1 mt-1 w-fit">
            <Plus size={13} /> {t('sessionCard.addInterval')}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <div className="grid grid-cols-[1.2rem_minmax(0,1fr)_minmax(0,1fr)_3.25rem] gap-1 text-chalkdim eyebrow px-0.5">
            <span>{t('sessionCard.set')}</span>
            <span className="truncate">
              {entry.bodyweight ? `+${t('sessionCard.wt')} (${entry.unit}) ${t('sessionCard.opt')}` : `${t('sessionCard.wt')} (${entry.unit})`}
            </span>
            <span>{t('sessionCard.reps')}</span>
            <InfoTip text={t('sessionCard.copyAboveTip')} />
          </div>
          {entry.sets.map((s, j) => (
            <div key={j} className="grid grid-cols-[1.2rem_minmax(0,1fr)_minmax(0,1fr)_3.25rem] gap-1 items-center">
              <span className="num text-chalkdim text-sm">{j + 1}</span>
              <Stepper value={s.weight} step={weightStep} onChange={(v) => onUpdateSet(j, { weight: v })} />
              <Stepper value={s.reps} step={1} onChange={(v) => onUpdateSet(j, { reps: v })} />
              <div className="flex items-center gap-0.5 justify-end min-w-0">
                {j === 0 && hasAnyLastData ? (
                  <button
                    onClick={() => useLastTime(j)}
                    title={hasChoice ? t('sessionCard.chooseLastTime') : t('sessionCard.useLastTime')}
                    className="text-chalkdim hover:text-brass p-1 inline-flex items-center"
                  >
                    <History size={14} />
                    {hasChoice && <ChevronDown size={10} />}
                  </button>
                ) : j > 0 ? (
                  <button onClick={() => copyFromPrevious(j)} title={t('sessionCard.sameAsSetAbove')} className="text-chalkdim hover:text-brass p-1">
                    <CornerDownLeft size={14} />
                  </button>
                ) : (
                  <span className="w-6" />
                )}
                <button onClick={() => onRemoveSet(j)} className="text-chalkdim hover:text-iron p-1">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          <button onClick={onAddSet} className="text-chalkdim hover:text-chalk text-xs inline-flex items-center gap-1 mt-1 w-fit">
            <Plus size={13} /> {t('sessionCard.addSet')}
          </button>
        </div>
      )}

      {onUpdateNote && showNote && (
        <div className="flex flex-col gap-1 pt-1 border-t border-line">
          <span className="eyebrow">{t('sessionCard.noteLabel')}</span>
          <input
            value={entry.notes || ''}
            onChange={(e) => onUpdateNote(e.target.value)}
            placeholder={t('sessionCard.notePlaceholder')}
            className="text-sm"
          />
        </div>
      )}
    </Card>
  )
}
