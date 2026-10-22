import ExerciseVideo from './ExerciseVideo.jsx'
import React, { useEffect, useRef, useState } from 'react'
import { X, Plus, Trash2, Minus, CornerDownLeft, StickyNote, Repeat, ArrowUp, ArrowDown, Trophy, Link2, Check, Flame } from 'lucide-react'
import { Badge } from './ui.jsx'
import { InfoTip } from './InfoTip.jsx'
import OverflowMenu from './OverflowMenu.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { fmtDate } from '../lib/dates.js'
import { isWarmup, workingSets, suggestWarmups } from '../lib/warmup.js'
import { formatSeconds } from '../lib/timed.js'
import { entryPrKind } from '../lib/records.js'
import { cardioSummary } from '../lib/cardio.js'
import CardioTotals from './CardioTotals.jsx'
import { entryName } from '../lib/names.js'

const hasVal = (v) => v !== '' && v != null

function Stepper({ value, onChange, step, min = 0, max, label, placeholder, done }) {
  const holdRef = useRef(null)
  const justFocused = useRef(false)

  // Tapping into a cell selects what's there, so typing replaces the old
  // number instead of appending to it. Selecting once on focus isn't
  // enough: the tap's own mouseup (desktop) and iOS Safari's caret
  // placement both land after focus and collapse the selection, so it is
  // selected again on the next tick and that first mouseup is cancelled.
  function selectAll(e) {
    const el = e.target
    justFocused.current = true
    el.select()
    setTimeout(() => {
      if (document.activeElement === el) el.select()
    }, 0)
  }

  function keepSelection(e) {
    if (!justFocused.current) return
    justFocused.current = false
    e.preventDefault()
  }

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

  // The +/- buttons only appear on wider screens; on a phone the row is too
  // tight for them and the number is typed instead.
  const btn =
    'max-[559px]:hidden px-1.5 min-w-[30px] min-h-[44px] shrink-0 bg-surface2 text-chalkdim hover:text-chalk active:bg-white/10 ' +
    'transition-colors select-none touch-none flex items-center justify-center'

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
      <button type="button" {...holdProps(-step)} aria-label={label ? `${label} −${step}` : undefined} className={`${btn} rounded-s-[10px]`}>
        <Minus size={13} />
      </button>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={selectAll}
        onMouseUp={keepSelection}
        onKeyDown={() => (justFocused.current = false)}
        onBlur={() => (justFocused.current = false)}
        aria-label={label}
        className={`num text-center !px-0.5 min-w-0 w-full text-[17px] font-medium placeholder:text-[#6E6E74] !rounded-[10px] min-[560px]:!rounded-none ${
          done ? '!bg-transparent' : ''
        }`}
      />
      <button type="button" {...holdProps(step)} aria-label={label ? `${label} +${step}` : undefined} className={`${btn} rounded-e-[10px]`}>
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
  // Earlier working sets {weight, reps}, to spot a reps record at a weight.
  pastSets,
  onUpdateSet,
  onAddSet,
  onAddWarmups,
  onRemoveSet,
  onRemoveEntry,
  onUpdateNote,
  onClearLastNote,
  onSwapExercise,
  onMoveUp,
  onMoveDown,
  // Called when a set is ticked off, so the page can start the rest timer.
  onSetDone,
  removable = false,
  // 'start' | 'mid' | 'end' when this card is part of a superset chain.
  supersetPos = null,
  // Gym name when the previous numbers come from another gym (this
  // exercise hasn't been done at the current gym yet).
  previousFrom = null,
}) {
  const { t, lang } = useLanguage()
  // Follow the current language (switching mid-workout updates the name).
  const displayName = liveExercise ? (lang === 'he' && liveExercise.name_he) || liveExercise.name : entryName(entry, {}, lang)
  const [showNote, setShowNote] = useState(!!entry.notes)
  // Indexes of the sets that numbers were just filled into, so they can flash.
  const [justFilled, setJustFilled] = useState([])
  const isCardio = entry.category === 'cardio'
  // Timed holds (plank, wall sit) are bodyweight-style sets whose "reps"
  // field holds seconds, so everything else about them carries over.
  const isTimed = !isCardio && !!entry.timed
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
  const hasLoggedRir = (entry.sets || []).some((s) => hasVal(s.rir))
  const showRir = !isCardio && (hasLoggedRir || (liveExercise ? !!liveExercise.track_rir : !!entry.trackRir))

  function copyFromPrevious(setIdx) {
    const prev = entry.sets[setIdx - 1]
    if (!prev) return
    flashFilled([setIdx])
    if (isCardio) onUpdateSet(setIdx, { duration: prev.duration, intensity: prev.intensity, distance: prev.distance })
    else onUpdateSet(setIdx, { weight: prev.weight, reps: prev.reps })
  }

  // Last time's sets, if we have the full breakdown (added once someone
  // logs a session after this feature shipped). "Last set" is whichever
  // set was done last (reverse-pyramid friendly); "top set" is the
  // heaviest/longest one, wherever in the session it fell (pyramid
  // friendly). Falls back to the single last-known value for older data.
  const lastSets = workingSets((liveExercise ? liveExercise.last_sets : entry.lastSets) || [])
  const lastSetData = lastSets.length > 0 ? lastSets[lastSets.length - 1] : null
  // Best set = biggest main number; on a tie, the one with the bigger second
  // number (reps for weighted lifts, extra weight for bodyweight, intensity
  // for cardio). A full tie keeps the earlier set.
  const topSetData = (() => {
    if (lastSets.length === 0) return null
    const [main, second] = isCardio ? ['duration', 'intensity'] : entry.bodyweight ? ['reps', 'weight'] : ['weight', 'reps']
    return lastSets.reduce((best, s) => {
      const dm = (Number(s[main]) || 0) - (Number(best[main]) || 0)
      if (dm !== 0) return dm > 0 ? s : best
      return (Number(s[second]) || 0) > (Number(best[second]) || 0) ? s : best
    })
  })()
  // The number in a set that a PR is judged on, matching the coach's alert.
  function prValue(s) {
    const raw = isCardio ? s.duration : entry.bodyweight ? s.reps : s.weight
    const n = Number(raw)
    return raw !== '' && raw != null && isFinite(n) ? n : null
  }
  const single = isCardio || !!entry.bodyweight
  function prKindOf(s) {
    return entryPrKind(entry, s, personalBest, pastSets)
  }
  // Best weight record and best reps record among this session's sets.
  let weightPr = null
  let repsPr = null
  for (const s of entry.sets || []) {
    const k = prKindOf(s)
    if (k === 'weight') {
      const v = prValue(s)
      if (weightPr == null || v > weightPr) weightPr = v
    } else if (k === 'reps') {
      if (repsPr == null || Number(s.reps) > Number(repsPr.reps)) repsPr = s
    }
  }
  const bestThisSession = weightPr ?? (repsPr ? Number(repsPr.reps) : null)

  // Warm-ups: labels and last-time hints count working sets only, and the
  // suggestion ramps toward the first working set's weight (else last
  // time's top weight).
  const setLabels = (() => {
    let n = 0
    return (entry.sets || []).map((s) => (isWarmup(s) ? t('sessionCard.warmupShort') : String(++n)))
  })()
  const firstWorking = workingSets(entry.sets)[0]
  const workingWeight = (() => {
    const filled = firstWorking && hasVal(firstWorking.weight) ? Number(firstWorking.weight) : null
    if (filled > 0) return filled
    if (topSetData && Number(topSetData.weight) > 0) return Number(topSetData.weight)
    return Number(lastWeight) > 0 ? Number(lastWeight) : null
  })()
  const warmupSuggestion = !isCardio && !entry.bodyweight && !(entry.sets || []).some(isWarmup) ? suggestWarmups(workingWeight, entry.unit) : []
  function addWarmups() {
    onAddWarmups(warmupSuggestion.map((w) => ({ weight: String(w.weight), reps: String(w.reps), rir: '', warmup: true })))
  }
  const prUnit = isCardio ? t('sessionCard.minUnit') : isTimed ? 's' : entry.bodyweight ? t('sessionCard.reps') : entry.unit

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

  const sameSet = (a, b) =>
    isCardio
      ? (Number(a.duration) || 0) === (Number(b.duration) || 0) && (Number(a.intensity) || 0) === (Number(b.intensity) || 0)
      : (Number(a.weight) || 0) === (Number(b.weight) || 0) && (Number(a.reps) || 0) === (Number(b.reps) || 0)
  const hasChoice = lastSetData && topSetData && !sameSet(lastSetData, topSetData)

  function flashFilled(idxs) {
    setJustFilled(idxs)
    if (navigator.vibrate) navigator.vibrate(12)
    setTimeout(() => setJustFilled((cur) => (cur === idxs ? [] : cur)), 700)
  }

  function applySet(setIdx, data) {
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

  // Tapping a set's "Previous" copies last session's numbers into that set.
  function usePrevious(setIdx, data) {
    applySet(setIdx, data)
    flashFilled([setIdx])
  }

  // The "Last set" / "Top set" chips fill every working set that isn't done.
  function fillAll(data) {
    const idxs = []
    ;(entry.sets || []).forEach((s, j) => {
      if (isWarmup(s) || s.done) return
      idxs.push(j)
      applySet(j, data)
    })
    flashFilled(idxs)
  }

  // Short text for one set's numbers, with no unit: "85 × 6", "+10 × 8",
  // "45s", "20 min · 5".
  function numbersText(data) {
    if (isCardio) {
      return `${data.duration} ${t('sessionCard.minUnit')}${hasVal(data.intensity) ? ` · ${data.intensity}` : ''}`
    }
    if (isTimed) {
      const added = Number(data.weight) > 0 ? `+${data.weight} · ` : ''
      return `${added}${formatSeconds(data.reps)}`
    }
    if (entry.bodyweight) return Number(data.weight) > 0 ? `+${data.weight} × ${data.reps}` : `${data.reps}`
    return `${data.weight} × ${data.reps}`
  }

  // What was logged for the Nth working set last time. Old data that only has
  // one last-known value shows it on every set.
  function previousFor(j) {
    if (isWarmup(entry.sets[j])) return null
    const n = workingSets(entry.sets.slice(0, j)).length
    if (lastSets.length > 0) return lastSets[n] || null
    if (lastWeight == null) return null
    return isCardio
      ? { duration: lastWeight, intensity: lastReps, distance: lastDistance }
      : { weight: lastWeight, reps: lastReps }
  }

  // Coach-set target for this exercise, e.g. "×10 · RIR 2". The number of
  // sets is already visible as rows, so only reps and RIR are worth saying.
  const targetBody = (() => {
    if (isCardio || !entry.targetSets) return null
    const reps = hasVal(entry.targetReps) ? `${entry.targetSets}×${entry.targetReps}${isTimed ? 's' : ''}` : ''
    const rir = entry.targetRir != null ? `RIR ${entry.targetRir}` : ''
    return [reps, rir].filter(Boolean).join(' · ') || null
  })()

  // Supersets get an edge down the start side, with a short connector
  // bridging the gap to the next card in the chain.
  const linkNext = supersetPos === 'start' || supersetPos === 'mid'
  const supersetClass = supersetPos ? 'border-s-[3px] border-s-chalkdim/50' : ''

  // Placeholders: the nearest value typed above wins over last session's, so
  // changing the first set carries down to the sets below it without writing
  // anything into them. Tapping the tick logs whatever is showing.
  const fieldDefs = isCardio
    ? [['duration', lastWeight], ['intensity', lastReps], ['distance', lastDistance]]
    : [['weight', lastWeight], ['reps', lastReps], ...(showRir ? [['rir', undefined]] : [])]
  function placeholderFor(j, key, fallback) {
    if (isWarmup(entry.sets[j])) return ''
    for (let i = j - 1; i >= 0; i--) {
      if (isWarmup(entry.sets[i])) continue
      if (hasVal(entry.sets[i][key])) return String(entry.sets[i][key])
    }
    const v = previousFor(j)?.[key]
    if (hasVal(v)) return String(v)
    // Past the sets logged last time, fall back to the single last-known value.
    return hasVal(fallback) ? String(fallback) : ''
  }

  function toggleDone(j) {
    const s = entry.sets[j]
    if (s.done) {
      onUpdateSet(j, { done: false })
      return
    }
    const patch = { done: true }
    for (const [key, fallback] of fieldDefs) {
      if (hasVal(s[key])) continue
      const v = placeholderFor(j, key, fallback)
      if (v !== '') patch[key] = v
    }
    const m = { ...s, ...patch }
    const complete = isCardio ? hasVal(m.duration) : hasVal(m.reps) && (entry.bodyweight || hasVal(m.weight))
    // A set with nothing in it can't be ticked off.
    if (!complete) return
    onUpdateSet(j, patch)
    if (navigator.vibrate) navigator.vibrate(10)
    onSetDone?.()
  }

  const setMenu = (j) => (
    <OverflowMenu
      label={`${t('sessionCard.moreSetActions')} ${setLabels[j]}`}
      align="start"
      triggerClassName={`press num text-[15px] font-medium min-h-[44px] w-7 inline-flex items-center justify-center rounded-[10px] hover:text-chalk ${
        isWarmup(entry.sets[j]) ? 'text-[#7C7C82]' : 'text-chalkdim'
      }`}
      trigger={setLabels[j]}
      items={[
        {
          key: 'warmup',
          label: t('sessionCard.toggleWarmup'),
          icon: <Flame size={16} />,
          onClick: () => onUpdateSet(j, { warmup: !entry.sets[j].warmup }),
          hidden: isCardio,
        },
        {
          key: 'same',
          label: isCardio ? t('sessionCard.sameAsAbove') : t('sessionCard.sameAsSetAbove'),
          icon: <CornerDownLeft size={16} />,
          onClick: () => copyFromPrevious(j),
          hidden: j === 0,
        },
        { key: 'remove', label: t('sessionCard.removeSet'), icon: <Trash2 size={16} />, onClick: () => onRemoveSet(j), danger: true },
      ]}
    />
  )

  const prevCell = (j) => {
    const s = entry.sets[j]
    const data = previousFor(j)
    if (!data) return <span className="text-[14px] text-[#7C7C82]">—</span>
    const text = numbersText(data)
    return (
      <button
        type="button"
        disabled={!!s.done}
        onClick={() => usePrevious(j, data)}
        aria-label={`${t('sessionCard.copyPrevious')} ${text}`}
        className="num h-11 min-w-0 w-full text-start text-[14px] text-[#7C7C82] active:text-chalk disabled:pointer-events-none transition-colors duration-150 whitespace-nowrap overflow-hidden text-ellipsis"
      >
        <bdi dir="ltr">{text}</bdi>
      </button>
    )
  }

  const doneBtn = (j) => {
    const done = !!entry.sets[j].done
    return (
      <button
        type="button"
        onClick={() => toggleDone(j)}
        aria-pressed={done}
        aria-label={t('sessionCard.markDone')}
        className={`press justify-self-center w-10 h-10 rounded-[11px] border-[1.5px] flex items-center justify-center transition-[background-color,border-color] duration-150 ${
          done ? 'bg-accent border-transparent' : 'border-[#3A3A40]'
        }`}
      >
        <Check size={18} strokeWidth={2.6} className={`text-ink transition-[opacity,transform] duration-150 ${done ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`} />
      </button>
    )
  }

  const headLabel = 'text-[12px] leading-4 text-[#7C7C82]'
  const cols = isCardio || showRir
    ? 'grid-cols-[28px_minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_44px]'
    : 'grid-cols-[28px_minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)_44px]'
  const rowBase = `grid gap-1.5 items-center min-h-[52px] ${cols}`
  const prevHead = (
    <span className="inline-flex items-center gap-1 text-start">
      {t('sessionCard.prevCol')} <InfoTip text={t('sessionCard.previousTip')} />
    </span>
  )

  return (
    <section className={`relative bg-surface rounded-[22px] pt-[18px] px-3.5 pb-1.5 flex flex-col gap-3 ${supersetClass}`}>
      {linkNext && <span className="absolute -start-[3px] top-full w-[3px] h-3 bg-chalkdim/50" aria-hidden="true" />}
      <div className="flex items-start justify-between gap-2 -mt-2.5 -me-2.5">
        <div className="min-w-0 flex-1 pt-1.5 px-0.5 flex flex-col gap-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-[17px] leading-[22px] font-semibold">{displayName}</h2>
            {weightPr != null && (
              <span
                className="pr-pop inline-flex items-center gap-1 rounded-full bg-accentsoft text-accent px-2 h-[22px] text-xs font-semibold"
                title={t('sessionCard.prTitle', { prev: `${personalBest}${prUnit}` })}
              >
                <Trophy size={12} /> {single ? t('sessionCard.prBadge') : t('sessionCard.weightPrBadge')} {weightPr}
                {prUnit}
              </span>
            )}
            {repsPr && (
              <span
                className="pr-pop inline-flex items-center gap-1 rounded-full bg-accentsoft text-accent px-2 h-[22px] text-xs font-semibold"
                title={t('sessionCard.repsPrTitle', { weight: `${repsPr.weight}${entry.unit}` })}
              >
                <Trophy size={12} /> {t('sessionCard.repsPrBadge')}{' '}
                <bdi dir="ltr">
                  {repsPr.weight}
                  {entry.unit} × {repsPr.reps}
                </bdi>
              </span>
            )}
            {supersetPos && (
              <Badge tone="brass">
                <span className="inline-flex items-center gap-1">
                  <Link2 size={11} /> {t('workout.supersetLabel')}
                </span>
              </Badge>
            )}
            {isCardio && <Badge tone="cardio">{t('sessionCard.cardioBadge')}</Badge>}
            {isTimed && <Badge tone="brass">{t('exercises.timedBadge')}</Badge>}
            {!isCardio && !isTimed && entry.bodyweight && <Badge tone="brass">{t('sessionCard.bodyweightBadge')}</Badge>}
            {/* Next to the name rather than in the icon row: sitting among
                the icons it made that row so wide on a phone that the name
                and the notes were squeezed into a narrow column. */}
            <ExerciseVideo
              name={displayName}
              matchNames={[liveExercise?.name, entry.nameEn]}
              videoUrl={entry.videoUrl}
              className="text-[13px] !text-chalkdim hover:!text-chalk"
            />
          </div>
          {/* The coach's cue for this exercise, set in the routine, with the
              label in primary text so it isn't mistaken for the lifter's own
              saved note beneath it. */}
          {entry.coachNote && (
            <p className="text-[13px] leading-[18px] text-chalkdim">
              <span className="font-medium text-chalk">{t('workout.coachLabel')}</span> {entry.coachNote}
            </p>
          )}
          {targetBody && (
            <p className="num text-[13px] leading-[18px] text-chalkdim">
              {t('workout.targetLine')} <bdi dir="ltr">{targetBody}</bdi>
            </p>
          )}
          {previousFrom && (
            <p className="text-[13px] leading-[18px] text-chalkdim">{t('gyms.previousFrom', { gym: previousFrom })}</p>
          )}
          {/* The last note written on this exercise — "seat on 4", "left
              knee sore" — resurfaced the next time it comes up, which is
              when it's actually useful. */}
          {liveExercise?.last_note && (
            <p className="text-[13px] leading-[18px] text-chalkdim">
              {liveExercise.last_note_date && (
                <>
                  {fmtDate(lang, new Date(liveExercise.last_note_date + 'T00:00:00'), { day: 'numeric', month: 'short' })}
                  {': '}
                </>
              )}
              {liveExercise.last_note}
            </p>
          )}
        </div>
        <OverflowMenu
          label={t('sessionCard.moreActions')}
          items={[
            { key: 'up', label: t('sessionCard.moveUp'), icon: <ArrowUp size={16} />, onClick: () => onMoveUp?.(), hidden: !onMoveUp },
            { key: 'down', label: t('sessionCard.moveDown'), icon: <ArrowDown size={16} />, onClick: () => onMoveDown?.(), hidden: !onMoveDown },
            { key: 'swap', label: t('sessionCard.swapExercise'), icon: <Repeat size={16} />, onClick: () => onSwapExercise?.(), hidden: !onSwapExercise },
            { key: 'note', label: t('sessionCard.addNote'), icon: <StickyNote size={16} />, onClick: () => setShowNote(true), hidden: !onUpdateNote || showNote },
            { key: 'clearNote', label: t('sessionCard.clearNote'), icon: <X size={16} />, onClick: () => onClearLastNote?.(), hidden: !onClearLastNote || !liveExercise?.last_note },
            { key: 'remove', label: t('sessionCard.removeExercise'), icon: <Trash2 size={16} />, onClick: () => onRemoveEntry?.(), danger: true, hidden: !removable },
          ]}
        />
      </div>

      {hasChoice && (
        <div className="flex flex-wrap items-center gap-2 px-0.5">
          <span className="hidden min-[560px]:inline text-[13px] text-[#7C7C82]">{t('sessionCard.fillFrom')}</span>
          {[
            ['sessionCard.lastSetChip', lastSetData],
            ['sessionCard.topSetChip', topSetData],
          ].map(([key, data]) => (
            <button
              key={key}
              type="button"
              onClick={() => fillAll(data)}
              className="press inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-surface2 text-chalkdim text-[13px] font-medium num"
            >
              {t(key)}{' '}
              <b className="text-chalk font-semibold">
                <bdi dir="ltr">{numbersText(data)}</bdi>
              </b>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-0.5">
        <div className={`${rowBase} !min-h-0 pb-1 ${headLabel}`}>
          <span className="text-center">{t('sessionCard.set')}</span>
          {prevHead}
          {isCardio ? (
            <>
              <span className="text-center truncate">{t('sessionCard.min')}</span>
              <span className="text-center truncate">{intensityLabel}</span>
              <span className="text-center truncate">{distanceUnit}</span>
            </>
          ) : (
            <>
              <span className="text-center truncate" title={entry.bodyweight ? t('sessionCard.opt') : undefined}>
                {entry.bodyweight ? `+${entry.unit}` : entry.unit}
              </span>
              <span className="text-center truncate">{isTimed ? t('sessionCard.seconds') : t('sessionCard.reps')}</span>
              {showRir && (
                <span className="inline-flex items-center justify-center gap-0.5">
                  {t('sessionCard.rir')} <InfoTip text={t('sessionCard.rirTip')} />
                </span>
              )}
            </>
          )}
          <span />
        </div>

        {entry.sets.map((s, j) => {
          const done = !!s.done
          const stepFor = (key) => (key === 'weight' ? weightStep : key === 'reps' ? (isTimed ? 5 : 1) : key === 'distance' ? 0.1 : 1)
          const cell = (key, label, opts = {}) => (
            <Stepper
              value={s[key]}
              step={opts.step ?? stepFor(key)}
              min={opts.min}
              max={opts.max}
              done={done}
              placeholder={placeholderFor(j, key, fieldDefs.find((f) => f[0] === key)?.[1])}
              onChange={(v) => onUpdateSet(j, { [key]: v })}
              label={`${t('sessionCard.set')} ${setLabels[j]} ${label}`}
            />
          )
          return (
            // Warm-ups are muted cell by cell, not on the whole row: opacity
            // on the row also faded the set menu inside it and trapped it
            // under the next rows, so its items couldn't be tapped.
            <div
              key={j}
              className={`${rowBase} ${justFilled.includes(j) ? 'flash-fill' : ''} ${isWarmup(s) ? '[&>*:not(:first-child):not(:last-child)]:opacity-70' : ''}`}
            >
              {setMenu(j)}
              {prevCell(j)}
              {isCardio ? (
                <>
                  {cell('duration', t('sessionCard.min'), { min: 0, step: 1 })}
                  {cell('intensity', intensityLabel, { min: 1, max: intensityMax, step: 1 })}
                  {cell('distance', distanceUnit, { min: 0 })}
                </>
              ) : (
                <>
                  {cell('weight', `${t('sessionCard.wt')} (${entry.unit})`)}
                  {cell('reps', isTimed ? t('sessionCard.seconds') : t('sessionCard.reps'))}
                  {showRir && cell('rir', 'RIR', { min: 0, max: 10 })}
                </>
              )}
              {doneBtn(j)}
            </div>
          )
        })}
      </div>

      <div className="flex border-t border-white/[0.06]">
        <button
          type="button"
          onClick={onAddSet}
          className="press flex-1 h-11 text-chalkdim hover:text-chalk text-sm font-medium inline-flex items-center justify-center gap-1.5"
        >
          <Plus size={16} /> {isCardio ? t('sessionCard.addInterval') : t('sessionCard.addSet')}
        </button>
        {!isCardio && onAddWarmups && warmupSuggestion.length > 0 && (
          <button
            type="button"
            onClick={addWarmups}
            className="press flex-1 h-11 text-chalkdim hover:text-chalk text-sm font-medium inline-flex items-center justify-center gap-1.5"
          >
            <Plus size={16} /> {t('sessionCard.addWarmups')}
          </button>
        )}
      </div>

      {/* Pace and speed appear as soon as a set has both a time and a distance. */}
      {isCardio &&
        (() => {
          const sum = cardioSummary(entry.sets)
          return sum && sum.distance != null ? (
            <p className="num text-sm text-chalkdim -mt-1 pb-2 text-start">
              <CardioTotals sets={entry.sets} unit={entry.unit} minLabel={t('sessionCard.minUnit')} />
            </p>
          ) : null
        })()}

      {onUpdateNote && showNote && (
        <div className="flex flex-col gap-1 pb-3 px-0.5">
          <span className="eyebrow">{t('sessionCard.noteLabel')}</span>
          <input
            value={entry.notes || ''}
            onChange={(e) => onUpdateNote(e.target.value)}
            placeholder={t('sessionCard.notePlaceholder')}
            className="text-sm"
          />
        </div>
      )}
    </section>
  )
}
