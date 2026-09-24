import React, { useEffect, useRef, useState } from 'react'
import { Play, Plus, Trash2, Minus, CornerDownLeft, History, StickyNote, ChevronDown, Repeat, ArrowUp, ArrowDown, Trophy } from 'lucide-react'
import { Card, Badge } from './ui.jsx'
import { InfoTip } from './InfoTip.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'

function Stepper({ value, onChange, step, min = 0, max, label }) {
  const holdRef = useRef(null)

  function bump(delta) {
    const current = Number(value) || 0
    let next = Math.max(min, Math.round((current + delta) * 100) / 100)
    if (max != null) next = Math.min(max, next)
    if (next === current) return
    onChange(String(next))
    // Android and most desktop browsers can buzz; iOS Safari can't, which
    // is why the press animation carries the feel on iPhone.
    if (navigator.vibrate) navigator.vibrate(8)
  }

  // Press and hold to run the number up, instead of tapping twenty times
  // to get from 0 to 100kg. Starts after a short pause so a normal tap is
  // still just one step.
  function startHold(delta) {
    stopHold()
    bump(delta)
    holdRef.current = setTimeout(() => {
      holdRef.current = setInterval(() => bump(delta), 90)
    }, 450)
  }

  function stopHold() {
    if (holdRef.current == null) return
    clearTimeout(holdRef.current)
    clearInterval(holdRef.current)
    holdRef.current = null
  }

  useEffect(() => stopHold, [])

  const btn =
    'px-2.5 min-h-[40px] shrink-0 bg-surface2 text-chalkdim hover:text-chalk active:bg-line active:scale-90 ' +
    'transition-transform duration-75 select-none touch-none border border-line flex items-center justify-center'

  // Bumping happens on press for immediacy; the click handler only fires
  // for keyboard activation (detail === 0), so a tap never counts twice.
  const holdProps = (delta) => ({
    onPointerDown: (e) => {
      e.preventDefault()
      startHold(delta)
    },
    onPointerUp: stopHold,
    onPointerLeave: stopHold,
    onPointerCancel: stopHold,
    onClick: (e) => {
      if (e.detail === 0) bump(delta)
    },
  })

  return (
    <div className="flex items-stretch min-w-0">
      <button
        type="button"
        {...holdProps(-step)}
        aria-label={label ? `${label} \u2212${step}` : undefined}
        className={`${btn} rounded-s-md border-e-0`}
      >
        <Minus size={13} />
      </button>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="num text-center !rounded-none !px-0.5 min-w-0 w-full"
      />
      <button
        type="button"
        {...holdProps(step)}
        aria-label={label ? `${label} +${step}` : undefined}
        className={`${btn} rounded-e-md border-s-0`}
      >
        <Plus size={13} />
      </button>
    </div>
  )
}

export default function SessionEntryCard({
  entry,
  // The current, live exercise record — when provided, this is ALWAYS
  // preferred over whatever last-known data is cached on `entry` itself.
  // This is what makes the "previously logged" hint immune to staleness
  // no matter how the entry was created (starting a routine, adding a
  // freestyle exercise, resuming a saved-for-later draft, or swapping an
  // exercise mid-workout) — one live source of truth instead of needing
  // every one of those code paths to remember to refresh it correctly.
  liveExercise,
  // All-time best for this exercise, from sessions already saved.
  personalBest,
  onUpdateSet,
  onAddSet,
  onRemoveSet,
  onRemoveEntry,
  onUpdateNote,
  onSwapExercise,
  onMoveUp,
  onMoveDown,
  removable = false,
}) {
  const { t } = useLanguage()
  const [showNote, setShowNote] = useState(!!entry.notes)
  const [showQuickFill, setShowQuickFill] = useState(false)
  // Index of the set that numbers were just filled into, so it can flash.
  const [justFilled, setJustFilled] = useState(null)
  const isCardio = entry.category === 'cardio'
  const weightStep = entry.unit === 'lb' ? 5 : 2.5
  const intensityMax = entry.intensityType === 'hr_zone' ? 5 : 10
  const intensityLabel = entry.intensityType === 'hr_zone' ? t('exercises.hrZone') : t('exercises.rpe')
  const distanceUnit = entry.unit === 'mi' ? 'mi' : 'km'

  // Prefer the live exercise record's data; fall back to whatever's on
  // the entry itself only if no live record was passed in at all.
  const lastWeight = liveExercise ? liveExercise.last_weight : entry.lastWeight
  const lastReps = liveExercise ? liveExercise.last_reps : entry.lastReps
  const lastDistance = liveExercise ? liveExercise.last_distance : entry.lastDistance
  // Show RIR if the exercise tracks it now, OR if this entry already has
  // RIR values logged (e.g. editing an old session) — logged data should
  // never be hidden just because the setting was later switched off.
  const hasLoggedRir = (entry.sets || []).some((s) => s.rir !== '' && s.rir != null)
  const showRir = !isCardio && (hasLoggedRir || (liveExercise ? !!liveExercise.track_rir : !!entry.trackRir))

  function copyFromPrevious(setIdx) {
    const prev = entry.sets[setIdx - 1]
    if (!prev) return
    flashFilled(setIdx)
    if (isCardio) onUpdateSet(setIdx, { duration: prev.duration, intensity: prev.intensity, distance: prev.distance })
    else onUpdateSet(setIdx, { weight: prev.weight, reps: prev.reps })
  }

  // Last time's sets, if we have the full breakdown (added once someone
  // logs a session after this feature shipped). "Last set" is whichever
  // set was done last (reverse-pyramid friendly); "top set" is the
  // heaviest/longest one, wherever in the session it fell (pyramid
  // friendly). Falls back to the single last-known value for older data.
  const lastSets = (liveExercise ? liveExercise.last_sets : entry.lastSets) || []
  const lastSetData = lastSets.length > 0 ? lastSets[lastSets.length - 1] : null
  const topSetData = (() => {
    if (lastSets.length === 0) return null
    if (isCardio) return lastSets.reduce((best, s) => (Number(s.duration) > Number(best.duration) ? s : best))
    if (entry.bodyweight) return lastSets.reduce((best, s) => (Number(s.reps) > Number(best.reps) ? s : best))
    return lastSets.reduce((best, s) => (Number(s.weight) > Number(best.weight) ? s : best))
  })()
  // The number in a set that a PR is judged on, matching the coach's alert.
  function prValue(s) {
    const raw = isCardio ? s.duration : entry.bodyweight ? s.reps : s.weight
    const n = Number(raw)
    return raw !== '' && raw != null && isFinite(n) ? n : null
  }
  function isPrSet(s) {
    // Only celebrate against a real previous best — the first time you
    // ever do an exercise isn't something you beat.
    if (personalBest == null) return false
    const v = prValue(s)
    return v != null && v > personalBest
  }
  const bestThisSession = (entry.sets || []).reduce((acc, s) => {
    const v = isPrSet(s) ? prValue(s) : null
    return v != null && (acc == null || v > acc) ? v : acc
  }, null)
  const prUnit = isCardio ? t('sessionCard.minUnit') : entry.bodyweight ? t('sessionCard.reps') : entry.unit

  // A short buzz the first moment a set crosses the old best, so it lands
  // while you're still holding the phone. Fires once per exercise.
  const celebrated = useRef(false)
  useEffect(() => {
    if (bestThisSession == null) {
      celebrated.current = false
      return
    }
    if (!celebrated.current) {
      celebrated.current = true
      if (navigator.vibrate) navigator.vibrate([90, 60, 140])
    }
  }, [bestThisSession])

  const hasChoice = lastSetData && topSetData && JSON.stringify(lastSetData) !== JSON.stringify(topSetData)
  const hasAnyLastData = lastSetData != null || lastWeight != null

  function flashFilled(setIdx) {
    setJustFilled(setIdx)
    if (navigator.vibrate) navigator.vibrate(12)
    setTimeout(() => setJustFilled((cur) => (cur === setIdx ? null : cur)), 700)
  }

  function applySet(setIdx, data) {
    flashFilled(setIdx)
    if (isCardio) {
      onUpdateSet(setIdx, {
        duration: String(data.duration),
        intensity: String(data.intensity),
        distance: data.distance != null && data.distance !== '' ? String(data.distance) : '',
      })
    } else {
      const patch = { weight: String(data.weight), reps: String(data.reps) }
      if (showRir) patch.rir = data.rir != null && data.rir !== '' ? String(data.rir) : ''
      onUpdateSet(setIdx, patch)
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
        ? { duration: lastWeight, intensity: lastReps, distance: lastDistance }
        : { weight: lastWeight, reps: lastReps })
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
    const rirPart = showRir && data.rir != null && data.rir !== '' ? ` · RIR ${data.rir}` : ''
    return `${data.weight}${entry.unit} × ${data.reps}${rirPart}`
  }

  const prevLabel = (() => {
    if (lastWeight == null) return null
    if (isCardio) {
      const dist = lastDistance != null ? ` · ${lastDistance}${distanceUnit}` : ''
      return `${t('sessionCard.previously')} ${lastWeight} ${t('sessionCard.minUnit')} · ${intensityLabel} ${lastReps}${dist}`
    }
    if (entry.bodyweight) {
      const added = Number(lastWeight) > 0 ? `+${lastWeight}${entry.unit} ` : ''
      return `${t('sessionCard.previously')} ${added}${t('sessionCard.bodyweightBadge')} × ${lastReps}`
    }
    return `${t('sessionCard.previously')} ${lastWeight}${entry.unit} × ${lastReps}`
  })()

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg">{entry.name}</h3>
            {bestThisSession != null && (
              <span
                className="pr-pop inline-flex items-center gap-1 rounded-full bg-brasssoft text-brass px-2 py-0.5 text-xs font-medium"
                title={t('sessionCard.prTitle', { prev: `${personalBest}${prUnit}` })}
              >
                <Trophy size={12} /> {t('sessionCard.prBadge')} {bestThisSession}
                {prUnit}
              </span>
            )}
            {isCardio && <Badge tone="cardio">{t('sessionCard.cardioBadge')}</Badge>}
            {!isCardio && entry.bodyweight && <Badge tone="brass">{t('sessionCard.bodyweightBadge')}</Badge>}
          </div>
          {prevLabel && (
            <p className="num text-chalkdim text-xs mt-0.5 inline-flex items-center gap-1 flex-wrap">
              {prevLabel}
              <InfoTip text={t('sessionCard.previousTip')} />
            </p>
          )}
          {/* The last note written on this exercise — "seat on 4", "left
              knee sore" — resurfaced the next time it comes up, which is
              when it's actually useful. */}
          {liveExercise?.last_note && (
            <p className="text-brass text-xs mt-1 flex items-start gap-1">
              <StickyNote size={12} className="shrink-0 mt-0.5" />
              <span>
                {liveExercise.last_note_date && (
                  <span className="text-chalkdim">
                    {new Date(liveExercise.last_note_date + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                    {': '}
                  </span>
                )}
                {liveExercise.last_note}
              </span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Reordering mid-workout: machines get taken, so the order you
              planned isn't always the order you can train. */}
          {(onMoveUp || onMoveDown) && (
            <span className="flex items-center">
              <button
                onClick={onMoveUp}
                disabled={!onMoveUp}
                title={t('sessionCard.moveUp')}
                aria-label={t('sessionCard.moveUp')}
                className="press text-chalkdim hover:text-chalk p-1 disabled:opacity-30 disabled:hover:text-chalkdim"
              >
                <ArrowUp size={15} />
              </button>
              <button
                onClick={onMoveDown}
                disabled={!onMoveDown}
                title={t('sessionCard.moveDown')}
                aria-label={t('sessionCard.moveDown')}
                className="press text-chalkdim hover:text-chalk p-1 disabled:opacity-30 disabled:hover:text-chalkdim"
              >
                <ArrowDown size={15} />
              </button>
            </span>
          )}
          {onSwapExercise && (
            <button
              onClick={onSwapExercise}
              title={t('sessionCard.swapExercise')}
              aria-label={t('sessionCard.swapExercise')}
              className="press text-chalkdim hover:text-brass p-1"
            >
              <Repeat size={15} />
            </button>
          )}
          {onUpdateNote && !showNote && (
            <button
              onClick={() => setShowNote(true)}
              title={t('sessionCard.addNote')}
              aria-label={t('sessionCard.addNote')}
              className="press text-chalkdim hover:text-brass p-1"
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
            <button onClick={onRemoveEntry} aria-label={t('sessionCard.removeExercise')} className="press text-chalkdim hover:text-iron">
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
            <div
              key={j}
              className={`grid grid-cols-[1.2rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_3.25rem] gap-1 items-center ${
                justFilled === j ? 'flash-fill' : ''
              }`}
            >
              <span className="num text-chalkdim text-sm">{j + 1}</span>
              <Stepper value={s.duration} step={1} min={0} onChange={(v) => onUpdateSet(j, { duration: v })} label={`${t('sessionCard.set')} ${j + 1} ${t('sessionCard.min')}`} />
              <Stepper
                label={`${t('sessionCard.set')} ${j + 1} ${intensityLabel}`}
                value={s.intensity}
                step={1}
                min={1}
                max={intensityMax}
                onChange={(v) => onUpdateSet(j, { intensity: v })}
              />
              <Stepper value={s.distance} step={0.1} min={0} onChange={(v) => onUpdateSet(j, { distance: v })} label={`${t('sessionCard.set')} ${j + 1} ${distanceUnit}`} />
              <div className="flex items-center gap-0.5 justify-end min-w-0">
                {j === 0 && hasAnyLastData ? (
                  <button
                    onClick={() => useLastTime(j)}
                    title={hasChoice ? t('sessionCard.chooseLastTime') : t('sessionCard.useLastTime')} aria-label={hasChoice ? t('sessionCard.chooseLastTime') : t('sessionCard.useLastTime')}
                    className="text-chalkdim hover:text-brass p-1 inline-flex items-center"
                  >
                    <History size={14} />
                    {hasChoice && <ChevronDown size={10} />}
                  </button>
                ) : j > 0 ? (
                  <button onClick={() => copyFromPrevious(j)} title={t('sessionCard.sameAsAbove')} aria-label={t('sessionCard.sameAsAbove')} className="press text-chalkdim hover:text-brass p-1">
                    <CornerDownLeft size={14} />
                  </button>
                ) : (
                  <span className="w-6" />
                )}
                <button onClick={() => onRemoveSet(j)} aria-label={t('sessionCard.removeSet')} className="press text-chalkdim hover:text-iron p-1">
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
          <div
            className={`grid gap-1 text-chalkdim eyebrow px-0.5 ${
              showRir ? 'grid-cols-[1.2rem_minmax(0,1fr)_minmax(0,1fr)_2.75rem_3.25rem]' : 'grid-cols-[1.2rem_minmax(0,1fr)_minmax(0,1fr)_3.25rem]'
            }`}
          >
            <span>{t('sessionCard.set')}</span>
            <span className="truncate">
              {entry.bodyweight ? `+${t('sessionCard.wt')} (${entry.unit}) ${t('sessionCard.opt')}` : `${t('sessionCard.wt')} (${entry.unit})`}
            </span>
            <span>{t('sessionCard.reps')}</span>
            {showRir && (
              <span className="inline-flex items-center gap-0.5">
                {t('sessionCard.rir')} <InfoTip text={t('sessionCard.rirTip')} />
              </span>
            )}
            <InfoTip text={t('sessionCard.copyAboveTip')} />
          </div>
          {entry.sets.map((s, j) => (
            <div
              key={j}
              className={`grid gap-1 items-center ${justFilled === j ? 'flash-fill' : ''} ${
                showRir ? 'grid-cols-[1.2rem_minmax(0,1fr)_minmax(0,1fr)_2.75rem_3.25rem]' : 'grid-cols-[1.2rem_minmax(0,1fr)_minmax(0,1fr)_3.25rem]'
              }`}
            >
              <span className="num text-chalkdim text-sm">{j + 1}</span>
              <Stepper value={s.weight} step={weightStep} onChange={(v) => onUpdateSet(j, { weight: v })} label={`${t('sessionCard.set')} ${j + 1} ${t('sessionCard.wt')} (${entry.unit})`} />
              <Stepper value={s.reps} step={1} onChange={(v) => onUpdateSet(j, { reps: v })} label={`${t('sessionCard.set')} ${j + 1} ${t('sessionCard.reps')}`} />
              {showRir && (
                <Stepper value={s.rir} step={1} min={0} max={10} onChange={(v) => onUpdateSet(j, { rir: v })} label={`${t('sessionCard.set')} ${j + 1} RIR`} />
              )}
              <div className="flex items-center gap-0.5 justify-end min-w-0">
                {j === 0 && hasAnyLastData ? (
                  <button
                    onClick={() => useLastTime(j)}
                    title={hasChoice ? t('sessionCard.chooseLastTime') : t('sessionCard.useLastTime')} aria-label={hasChoice ? t('sessionCard.chooseLastTime') : t('sessionCard.useLastTime')}
                    className="text-chalkdim hover:text-brass p-1 inline-flex items-center"
                  >
                    <History size={14} />
                    {hasChoice && <ChevronDown size={10} />}
                  </button>
                ) : j > 0 ? (
                  <button onClick={() => copyFromPrevious(j)} title={t('sessionCard.sameAsSetAbove')} aria-label={t('sessionCard.sameAsSetAbove')} className="press text-chalkdim hover:text-brass p-1">
                    <CornerDownLeft size={14} />
                  </button>
                ) : (
                  <span className="w-6" />
                )}
                <button onClick={() => onRemoveSet(j)} aria-label={t('sessionCard.removeSet')} className="press text-chalkdim hover:text-iron p-1">
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
