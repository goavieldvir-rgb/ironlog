import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { Plus, Library, X, MapPin, ChevronDown, ArrowDown, ArrowUp, Search } from 'lucide-react'
import { InfoTip } from './InfoTip.jsx'
import { useAdmin } from '../context/AdminContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFeedback } from '../context/FeedbackContext.jsx'
import { useCollection, logSession, addExercise, clearExerciseNote, isCompletedSet } from '../lib/db.js'
import { useGyms, sessionGymId, gymHistory, exerciseAtGym, gymLabel } from '../lib/gyms.js'
import { saveDraft, loadDraft, clearDraft, FREESTYLE_KEY } from '../lib/draft.js'
import { toLocalISODate, fmtDate } from '../lib/dates.js'
import { Button, Card, Field, LoadError } from './ui.jsx'
import SessionEntryCard from './SessionEntryCard.jsx'
import ExercisePicker, { useDialog } from './ExercisePicker.jsx'
import ExerciseSelect from './ExerciseSelect.jsx'
import { ExerciseModal, emptyExerciseForm } from './ExerciseLibrary.jsx'
import RestTimer, { clearSavedRest } from './RestTimer.jsx'
import { useScrollLock } from '../lib/scrollLock.js'
import { useWakeLock } from '../lib/wakeLock.js'
import { isWarmup, workingSets } from '../lib/warmup.js'
import { restFor } from '../lib/rest.js'
import { buildSummary } from '../lib/shareSummary.js'
import { recordBaseline } from '../lib/records.js'
import { entryName, exerciseMap } from '../lib/names.js'
import { preloadShareFonts } from '../lib/shareCard.js'
import { weeklyStreak } from '../lib/streak.js'
import WorkoutDone from './WorkoutDone.jsx'

function todayISO() {
  return toLocalISODate()
}

// The coach's optional per-exercise extras from the routine: a cue shown on
// the card, and a link to the next exercise (superset). Only set when present
// so entries for older routines look exactly as before.
function coachFields(it) {
  return {
    ...(it.coachNote ? { coachNote: it.coachNote } : {}),
    ...(it.supersetWithNext ? { supersetWithNext: true } : {}),
  }
}

// One id per workout, made on the client so a retried Finish saves once.
function newSessionId() {
  try {
    return crypto.randomUUID()
  } catch {
    // Insecure context: build a v4-shaped id by hand.
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      return (c === 'x' ? r : (r & 3) | 8).toString(16)
    })
  }
}

// Each entry carries a client-only `uid` used as its React key, so a card's
// local state (open note, menu) follows it when the exercise is moved. Drafts
// saved before this existed get one on load. It is never saved with a session:
// handleFinish builds each saved entry from an explicit list of fields.
function withKeys(list) {
  return list.map((e) => (e.uid ? e : { ...e, uid: newSessionId() }))
}

// A set that has been ticked or has numbers in it (cardio starts with its
// duration pre-filled, so only a typed distance counts there).
function setHasLogged(entry, s) {
  if (s.done) return true
  return entry.category === 'cardio' ? s.distance !== '' && s.distance != null : [s.weight, s.reps].some((v) => v !== '' && v != null)
}

// Only set when there is one, so entries without a rest look as before.
function withRest(seconds) {
  return seconds != null ? { restSeconds: seconds } : {}
}

function emptySet(category) {
  return category === 'cardio' ? { duration: '', intensity: '', distance: '' } : { weight: '', reps: '', rir: '' }
}

// Where an entry sits in a superset chain: 'start' / 'mid' / 'end', or null.
// Derived from each entry's supersetWithNext flag, so moving, swapping or
// removing exercises can never leave a stale group behind.
function supersetPos(entries, i) {
  const next = !!entries[i].supersetWithNext && i < entries.length - 1
  const prev = i > 0 && !!entries[i - 1].supersetWithNext
  if (next && prev) return 'mid'
  if (next) return 'start'
  if (prev) return 'end'
  return null
}

// A resumed draft older than this gets a "still the same workout?" note.
const STALE_DRAFT_MS = 12 * 60 * 60 * 1000

// Modal shell for the swap dialog and the add sheet: dialog semantics, Escape,
// focus in on open and back to the trigger on close, page scroll locked.
// `sheet` anchors it to the bottom of the screen instead of centring it.
function ModalShell({ onClose, label, sheet, children }) {
  const ref = useRef(null)
  useDialog(ref, onClose)
  useScrollLock(true)
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby={label}
      className={`fixed inset-0 bg-ink/80 backdrop-blur-sm z-30 flex justify-center outline-none ${sheet ? 'items-end' : 'items-center p-4'}`}
      style={sheet ? undefined : { paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))', paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}
      onClick={onClose}
    >
      {children}
    </div>
  )
}

// Bottom sheet for adding an exercise in one tap: search on top, the lifter's
// most-used exercises first, then everything else that matches.
function AddExerciseSheet({ options, recentIds, onPick, onBrowse, onClose, t }) {
  const titleId = useId()
  const [q, setQ] = useState('')
  const inputRef = useRef(null)
  // Explicit, because the sheet's focus handling runs after this and would
  // otherwise land on the dialog itself.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])
  const needle = q.trim().toLowerCase()
  const match = (o) => !needle || o.label.toLowerCase().includes(needle) || (o.alt && o.alt.toLowerCase().includes(needle))
  const recentSet = new Set(recentIds)
  const recent = recentIds.map((id) => options.find((o) => o.id === id)).filter((o) => o && match(o))
  const rest = options.filter((o) => !recentSet.has(o.id) && match(o))
  const row = (o) => (
    <button
      key={o.id}
      type="button"
      onClick={() => onPick(o.id)}
      className="press-row w-full text-start px-3 min-h-[48px] text-[15px] text-chalk hover:bg-surface2 rounded-md flex items-center"
    >
      <span className="truncate">{o.label}</span>
    </button>
  )
  return (
    <ModalShell onClose={onClose} label={titleId} sheet>
      <div
        className="card w-full max-w-lg max-h-[85dvh] flex flex-col rounded-b-none px-4 pt-4"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 id={titleId} className="text-xl">{t('workout.addExercise')}</h2>
          <button type="button" onClick={onClose} aria-label={t('common.close')} title={t('common.close')} className="press w-11 h-11 -me-2 flex items-center justify-center text-chalkdim hover:text-chalk">
            <X size={20} />
          </button>
        </div>
        <div className="relative mb-2">
          <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-chalkdim pointer-events-none" aria-hidden="true" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('common.searchExercises')}
            aria-label={t('common.searchExercises')}
            className="w-full ps-9"
          />
        </div>
        <div className="flex-1 overflow-y-auto -mx-2 px-2 min-h-[160px]">
          {recent.length > 0 && (
            <section aria-label={t('workout.addSheetRecent')}>
              <p className="px-3 pt-1 pb-1 text-[11px] uppercase tracking-wide text-chalkdim" aria-hidden="true">{t('workout.addSheetRecent')}</p>
              {recent.map(row)}
            </section>
          )}
          {rest.length > 0 && (
            <section aria-label={t('workout.addSheetAll')}>
              {recent.length > 0 && <p className="px-3 pt-3 pb-1 text-[11px] uppercase tracking-wide text-chalkdim" aria-hidden="true">{t('workout.addSheetAll')}</p>}
              {rest.map(row)}
            </section>
          )}
          {recent.length === 0 && rest.length === 0 && (
            <p className="text-chalkdim text-sm px-3 py-3">{options.length === 0 ? t('workout.addSheetNone') : t('common.noMatches')}</p>
          )}
        </div>
        <div className="pt-3 mt-2 border-t border-line">
          <button type="button" onClick={onBrowse} className="press min-h-[44px] text-brass text-sm inline-flex items-center gap-1.5">
            <Library size={16} /> {t('routines.browseLibrary')}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

export default function WorkoutSession() {
  const { effectiveUid } = useAdmin()
  const { t, lang } = useLanguage()
  const { confirm, toast } = useFeedback()
  const { routineId } = useParams()
  const navigate = useNavigate()
  const isFreestyle = routineId === 'freestyle'

  const [routines, routinesLoading, refreshRoutines, routinesError] = useCollection(effectiveUid, 'routines', 'created_at', 'desc')
  const [exercises, , refreshExercises] = useCollection(effectiveUid, 'exercises', 'name', 'asc')
  const [pastSessions, pastLoading] = useCollection(effectiveUid, 'sessions', 'date', 'desc')
  const liveName = (entry) => entryName(entry, exerciseMap(exercises), lang)

  // Which gym this workout is at. Only someone who has added a gym gets a
  // choice; it starts at the gym of their last workout. null = main gym.
  // The gym is settled once, after gyms and past workouts have loaded, and
  // kept in the draft, so it never changes under someone mid-workout.
  const { gyms, mainName, enabled: gymsOn, loading: gymsLoading } = useGyms(effectiveUid)
  const [gymChoice, setGymChoice] = useState(undefined)
  const gymsReady = !gymsLoading && !pastLoading
  useEffect(() => {
    if (!gymsReady || !gymsOn) return
    // A gym removed since the draft was saved counts as the main gym, as
    // its workouts do.
    if (gymChoice === undefined) setGymChoice(pastSessions.length ? sessionGymId(pastSessions[0], gyms) : null)
    else if (gymChoice && !gyms.some((g) => g.id === gymChoice)) setGymChoice(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gymsReady, gymsOn, gyms, gymChoice])
  const gymId = gymsOn && gymChoice && gyms.some((g) => g.id === gymChoice) ? gymChoice : null
  // Sessions that count for records: the current gym's only.
  const recordSessions = useMemo(
    () => (gymsOn ? pastSessions.filter((s) => sessionGymId(s, gyms) === gymId) : pastSessions),
    [pastSessions, gymsOn, gyms, gymId],
  )
  // Exercises with their "previous" numbers taken from the current gym.
  const history = useMemo(() => (gymsOn ? gymHistory(pastSessions, gyms) : null), [gymsOn, pastSessions, gyms])
  const gymExercises = useMemo(
    () => (history && !pastLoading ? exercises.map((e) => exerciseAtGym(e, history, gymId)) : exercises),
    [exercises, history, pastLoading, gymId],
  )

  // All-time best per exercise, from every session already saved (at this
  // gym, for someone with several). Same rule the admin PR alert uses —
  // heaviest weight for strength, most reps for a bodyweight move, longest
  // interval for cardio — so what the lifter sees and what the coach gets
  // notified about never disagree.
  const { personalBests, pastStrengthSets } = useMemo(() => recordBaseline(recordSessions), [recordSessions])
  const routine = useMemo(() => routines.find((r) => r.id === routineId), [routines, routineId])
  // Each routine keeps its own in-progress workout, so starting a second
  // one never overwrites an unfinished first.
  const draftKey = isFreestyle ? FREESTYLE_KEY : routineId

  const [date, setDate] = useState(todayISO())
  const [notes, setNotes] = useState('')
  const [entries, setEntries] = useState([])
  // A one-time, this-session-only substitution — e.g. a machine is broken
  // at the gym today. Only the local `entries` state changes; the routine
  // document itself is never touched, so next time this routine is
  // started, the original exercise is back.
  const [swapIndex, setSwapIndex] = useState(null)
  const [swapPickId, setSwapPickId] = useState('')
  // Shared between freestyle-add and swap: whichever one is active is
  // tracked by swapIndex (null = adding, a number = swapping that entry),
  // so both flows can share this one picker and create-custom modal
  // instead of duplicating them.
  const [showLibraryPicker, setShowLibraryPicker] = useState(false)
  const [creatingCustom, setCreatingCustom] = useState(false)
  // The "+ Add exercise" bottom sheet.
  const [showAddSheet, setShowAddSheet] = useState(false)
  // Set when a resumed draft was started long ago: when it was started.
  const [staleSince, setStaleSince] = useState(null)
  const [saving, setSaving] = useState(false)
  useScrollLock(showLibraryPicker || creatingCustom)
  const [saved, setSaved] = useState(false)
  const [summary, setSummary] = useState(null)
  // Screen stays on for the whole workout; the summary screen lets it sleep.
  useWakeLock(!summary)
  // When this workout was started — carried inside the draft, so resuming
  // after a phone lock or app switch keeps the original start time.
  const [startedAt, setStartedAt] = useState(null)
  // Kept in the draft so it survives a reload and is the saved session's id.
  const [sessionId, setSessionId] = useState(newSessionId)
  const [now, setNow] = useState(Date.now())
  const restRef = useRef(null)
  const dateInputRef = useRef(null)
  // Tracks whether we've done the initial "restore a draft, or build fresh
  // from the routine" pass — autosave shouldn't run before that, or it'd
  // immediately overwrite a real draft with an empty one for a split second.
  const [ready, setReady] = useState(false)

  // A resumed draft's "previously logged" hints (lastWeight/lastReps/
  // lastSets) were frozen the moment the draft was first created — if you
  // started this workout days ago, abandoned it, and logged this same
  // exercise again in the meantime through a different routine, the
  // resumed draft would still show the OLD stale numbers, or none at all
  // if there was no history yet back when the draft was created. This
  // re-checks against your current exercise data on resume, so the hint
  // is always accurate — everything else about the draft (the actual
  // sets you'd already typed in, notes) is left completely untouched.
  function refreshLastKnownData(draftEntries, liveExercises) {
    return draftEntries.map((entry) => {
      const full = liveExercises.find((e) => e.id === entry.exerciseId)
      if (!full) return entry
      return {
        ...entry,
        lastWeight: full.last_weight,
        lastReps: full.last_reps,
        lastDistance: full.last_distance,
        lastSets: full.last_sets || [],
      }
    })
  }

  // A fresh set of entries from the routine template.
  function buildRoutineEntries(r) {
    return withKeys(
        r.exercises.map((it) => {
          const full = exercises.find((e) => e.id === it.exerciseId)
          const category = it.category || full?.category || 'strength'
          if (category === 'cardio') {
            return {
              exerciseId: it.exerciseId,
              name: (lang === 'he' && full?.name_he) || full?.name || it.name,
              nameEn: full?.name || it.name,
              nameHe: full?.name_he || null,
              unit: it.unit,
              category: 'cardio',
              intensityType: it.intensityType || full?.intensity_type || 'rpe',
              videoUrl: full?.video_url || it.videoUrl || '',
              lastWeight: full?.last_weight,
              lastReps: full?.last_reps,
              lastDistance: full?.last_distance,
              lastSets: full?.last_sets || [],
              ...coachFields(it),
              notes: '',
              sets: [
                {
                  duration: String(it.targetDuration ?? full?.last_weight ?? 20),
                  intensity: String(it.targetIntensity ?? full?.last_reps ?? 5),
                  distance: '',
                },
              ],
            }
          }
          return {
            exerciseId: it.exerciseId,
            name: (lang === 'he' && full?.name_he) || full?.name || it.name,
            nameEn: full?.name || it.name,
            nameHe: full?.name_he || null,
            unit: it.unit,
            bodyweight: it.bodyweight ?? full?.bodyweight ?? false,
            timed: full?.timed ?? it.timed ?? false,
            videoUrl: full?.video_url || it.videoUrl || '',
            lastWeight: full?.last_weight,
            lastReps: full?.last_reps,
            lastSets: full?.last_sets || [],
            ...coachFields(it),
            targetSets: it.targetSets || null,
            targetReps: it.targetReps ?? null,
            ...(it.targetRir != null && it.targetRir !== '' ? { targetRir: Number(it.targetRir) } : {}),
            ...withRest(restFor(it, full)),
            notes: '',
            sets: Array.from({ length: it.targetSets || 3 }, () => ({ weight: '', reps: '', rir: '' })),
          }
        }),
    )
  }

  // On open: if there's a matching in-progress draft for this exact routine
  // (or this exact freestyle session) sitting in local storage, restore it
  // instead of starting fresh — this is what makes "Resume workout" work,
  // and also what saves you if Safari reloads the tab mid-session.
  // Fetch the share picture's fonts now so they're ready when the workout ends.
  useEffect(() => {
    preloadShareFonts()
  }, [])

  useEffect(() => {
    if (isFreestyle) {
      const draft = loadDraft(effectiveUid, draftKey)
      if (draft && draft.routineId === null) {
        setEntries(withKeys(refreshLastKnownData(draft.entries || [], exercises)))
        if (draft.startedAt && Date.now() - draft.startedAt > STALE_DRAFT_MS) setStaleSince(draft.startedAt)
        setDate(draft.date || todayISO())
        setNotes(draft.notes || '')
        setStartedAt(draft.startedAt || null)
        if (draft.sessionId) setSessionId(draft.sessionId)
        if (draft.gymId !== undefined) setGymChoice(draft.gymId)
        setReady(true)
        return
      }
      setEntries([])
      setStartedAt(Date.now())
      setReady(true)
      return
    }
    if (routine) {
      const draft = loadDraft(effectiveUid, draftKey)
      if (draft && draft.routineId === routine.id) {
        setEntries(withKeys(refreshLastKnownData(draft.entries || [], exercises)))
        if (draft.startedAt && Date.now() - draft.startedAt > STALE_DRAFT_MS) setStaleSince(draft.startedAt)
        setDate(draft.date || todayISO())
        setNotes(draft.notes || '')
        setStartedAt(draft.startedAt || null)
        if (draft.sessionId) setSessionId(draft.sessionId)
        if (draft.gymId !== undefined) setGymChoice(draft.gymId)
        setReady(true)
        return
      }
      setEntries(buildRoutineEntries(routine))
      setStartedAt(Date.now())
      setReady(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routine?.id, exercises.length, isFreestyle, effectiveUid])

  const category = isFreestyle ? 'strength' : routine?.category || 'strength'

  // Autosave every change to local storage so a backgrounded-tab reload
  // never wipes out what's already been logged.
  useEffect(() => {
    // Once the workout is saved, a late change (an Undo tapped on the recap)
    // must not bring the draft back for a session that's already logged.
    if (!ready || saved || entries.length === 0) return
    saveDraft(effectiveUid, draftKey, {
      routineId: isFreestyle ? null : routine?.id || null,
      // Canonical name; the UI shows the translated label at display time.
      routineName: isFreestyle ? 'Freestyle' : routine?.name,
      freestyle: isFreestyle || undefined,
      category,
      date,
      notes,
      entries,
      startedAt,
      sessionId,
      ...(gymChoice !== undefined ? { gymId: gymChoice } : {}),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, date, notes, ready, saved, startedAt, gymChoice, sessionId])

  // Ticks the elapsed-time display. Once a minute is plenty for a workout.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(id)
  }, [])

  // iOS often reopens the PWA at the top of the page (or reloads it) after
  // a trip to another app. Coming back mid-workout, offer a one-tap jump to
  // the exercise in progress: the first one with a working set not ticked yet.
  const entryRefs = useRef([])
  const currentInViewRef = useRef(false)
  const [jumpArmed, setJumpArmed] = useState(true)
  const [currentInView, setCurrentInView] = useState(true)
  const [currentAbove, setCurrentAbove] = useState(false)
  const [glowIdx, setGlowIdx] = useState(null)
  const [jumpLeaving, setJumpLeaving] = useState(false)
  const anyDone = entries.some((e) => workingSets(e.sets).some((s) => s.done))
  const currentIdx = anyDone ? entries.findIndex((e) => workingSets(e.sets).some((s) => !s.done)) : -1

  useEffect(() => {
    const arm = () => {
      if (document.visibilityState === 'visible' && !currentInViewRef.current) setJumpArmed(true)
    }
    document.addEventListener('visibilitychange', arm)
    window.addEventListener('pageshow', arm)
    return () => {
      document.removeEventListener('visibilitychange', arm)
      window.removeEventListener('pageshow', arm)
    }
  }, [])

  useEffect(() => {
    const el = entryRefs.current[currentIdx]
    if (!el) return
    const io = new IntersectionObserver(([e]) => {
      currentInViewRef.current = e.isIntersecting
      setCurrentInView(e.isIntersecting)
      setCurrentAbove(e.boundingClientRect.top < 0)
      // Seeing it once, however you got there, retires the button.
      if (e.isIntersecting) setJumpArmed(false)
    })
    io.observe(el)
    return () => io.disconnect()
    // The card order too: cards are keyed by uid, so a move changes which
    // node sits at an index. Typing in a set doesn't change the order.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx, entries.map((e) => e.uid).join()])

  function jumpToCurrent() {
    const el = entryRefs.current[currentIdx]
    if (!el || jumpLeaving) return
    // Let the tap ripple play out before the button goes, even if the card
    // scrolls into view (and disarms it) first.
    setJumpLeaving(true)
    setJumpArmed(false)
    setTimeout(() => setJumpLeaving(false), 420)
    scrollToEntry(currentIdx)
  }

  // Supersets call this on every round, so a new glow replaces the last one
  // (restarting the animation) instead of an old timer cutting it short.
  const glowTimer = useRef(null)
  function scrollToEntry(idx) {
    const el = entryRefs.current[idx]
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
    clearTimeout(glowTimer.current)
    setGlowIdx(null)
    requestAnimationFrame(() => setGlowIdx(idx))
    glowTimer.current = setTimeout(() => setGlowIdx(null), 1800)
  }

  // A ticked working set inside a superset moves straight on to the next
  // exercise in the group that still has sets left, with no rest. Only the
  // last exercise of a round starts the rest timer, and the page then goes
  // back to the first exercise of the group for the next round. Warm-ups
  // and exercises outside a superset rest as usual.
  function handleSetDone(entryIdx, setIdx) {
    const entry = entries[entryIdx]
    // An exercise with its own rest (from the routine or the exercise's
    // settings) uses it; otherwise the timer keeps its last picked length.
    if (!supersetPos(entries, entryIdx) || isWarmup(entry.sets[setIdx])) {
      restRef.current?.start(entry.restSeconds)
      return
    }
    let first = entryIdx
    while (first > 0 && entries[first - 1].supersetWithNext) first--
    let last = entryIdx
    while (last < entries.length - 1 && entries[last].supersetWithNext) last++
    // The tick that triggered this hasn't reached `entries` yet.
    const hasSetsLeft = (k) =>
      entries[k].sets.some((x, j) => !(k === entryIdx && j === setIdx) && !isWarmup(x) && !x.done)
    for (let k = entryIdx + 1; k <= last; k++) {
      if (hasSetsLeft(k)) {
        scrollToEntry(k)
        toast(t('workout.supersetNextUp', { name: liveName(entries[k]) }))
        return
      }
    }
    restRef.current?.start(entry.restSeconds)
    for (let k = first; k <= last; k++) {
      if (hasSetsLeft(k)) {
        if (k !== entryIdx) scrollToEntry(k)
        return
      }
    }
  }

  function toggleSuperset(entryIdx) {
    setEntries((prev) =>
      prev.map((e, i) => {
        if (i !== entryIdx) return e
        const { supersetWithNext, ...rest } = e
        return supersetWithNext ? rest : { ...rest, supersetWithNext: true }
      }),
    )
  }

  // Duration only means something for a workout logged live today — not
  // one being backfilled for a past date, and not a draft abandoned
  // overnight and finished the next morning (hence the 5-hour cap).
  const isLive = startedAt && date === todayISO()
  const elapsedMin = isLive ? Math.max(0, Math.round((now - startedAt) / 60000)) : null
  function finalDuration() {
    if (!isLive) return null
    const m = Math.round((Date.now() - startedAt) / 60000)
    return m >= 1 && m <= 300 ? m : null
  }

  // Builds a fresh entry for a given exercise — shared by freestyle-add
  // and swap, so there's exactly one place that knows how to construct
  // an entry from scratch, not two slowly-diverging copies of the same
  // logic.
  function buildEntryFromExercise(ex, targetSets = 3) {
    if (ex.category === 'cardio') {
      return {
        uid: newSessionId(),
        exerciseId: ex.id,
        name: (lang === 'he' && ex.name_he) || ex.name,
        nameEn: ex.name,
        nameHe: ex.name_he || null,
        unit: ex.unit,
        category: 'cardio',
        intensityType: ex.intensity_type || 'rpe',
        videoUrl: ex.video_url || '',
        lastWeight: ex.last_weight,
        lastReps: ex.last_reps,
        lastDistance: ex.last_distance,
        lastSets: ex.last_sets || [],
        notes: '',
        sets: [{ duration: String(ex.last_weight ?? 20), intensity: String(ex.last_reps ?? 5), distance: '' }],
      }
    }
    return {
      uid: newSessionId(),
      exerciseId: ex.id,
      name: (lang === 'he' && ex.name_he) || ex.name,
      nameEn: ex.name,
      nameHe: ex.name_he || null,
      unit: ex.unit,
      bodyweight: !!ex.bodyweight,
      timed: !!ex.timed,
      videoUrl: ex.video_url || '',
      lastWeight: ex.last_weight,
      lastReps: ex.last_reps,
      lastSets: ex.last_sets || [],
      ...withRest(restFor(null, ex)),
      notes: '',
      sets: Array.from({ length: targetSets }, () => ({ weight: '', reps: '', rir: '' })),
    }
  }

  // A swapped-in exercise keeps its slot in a superset, but not the coach's
  // cue or target, which were written for the original exercise.
  function swapped(old, ex, targetSets) {
    return { ...buildEntryFromExercise(ex, targetSets), ...(old.supersetWithNext ? { supersetWithNext: true } : {}) }
  }

  // One tap in the add sheet: the exercise goes to the end, the sheet closes.
  function addFromSheet(id) {
    const ex = gymExercises.find((e) => e.id === id)
    if (!ex) return
    const entry = buildEntryFromExercise(ex)
    const at = entries.length
    setEntries((prev) => [...prev, entry])
    setShowAddSheet(false)
    toast(t('workout.exerciseAdded', { name: liveName(entry) }))
    // After the sheet has unlocked the page, bring the new card into view.
    setTimeout(() => scrollToEntry(at), 150)
  }

  // Start over from the routine template (or empty, for a freestyle session).
  function startFresh() {
    clearDraft(effectiveUid, draftKey)
    clearSavedRest()
    setStaleSince(null)
    setDate(todayISO())
    setNotes('')
    setSessionId(newSessionId())
    setStartedAt(Date.now())
    setEntries(isFreestyle || !routine ? [] : buildRoutineEntries(routine))
  }

  // Swapping keeps what was logged when the new exercise takes the same kind
  // of numbers (both cardio, or both not). Otherwise the logged sets can't
  // carry over, so ask before throwing them away. Returns false if cancelled.
  async function swapEntry(ex) {
    const old = entries[swapIndex]
    if (!old) return false
    const sameKind = (old.category === 'cardio') === (ex.category === 'cardio')
    const logged = (old.sets || []).filter((s) => setHasLogged(old, s)).length
    if (!sameKind && logged > 0) {
      const ok = await confirm({
        title: t('workout.swapClearTitle', { name: liveName(old) }),
        body: t(logged === 1 ? 'workout.swapClearOne' : 'workout.swapClearMany', { n: logged }),
        confirmLabel: t('workout.swapClearConfirm'),
        danger: true,
      })
      if (!ok) return false
    }
    const idx = swapIndex
    // Keep whatever number of sets the original exercise had planned —
    // swapping shouldn't also reset how many sets you meant to do.
    const targetSets = workingSets(old.sets).length || 3
    setEntries((prev) =>
      prev.map((e, i) => {
        if (i !== idx) return e
        const next = swapped(e, ex, targetSets)
        return sameKind ? { ...next, sets: e.sets, ...(e.notes ? { notes: e.notes } : {}) } : next
      }),
    )
    return true
  }

  async function performSwap() {
    const ex = gymExercises.find((e) => e.id === swapPickId)
    if (!ex || swapIndex == null) return
    if (!(await swapEntry(ex))) return
    setSwapIndex(null)
    setSwapPickId('')
  }

  // Used by both the "browse library" and "create custom exercise" paths,
  // for both freestyle-add and swap — one place that knows how to place
  // a newly-picked-or-created exercise wherever it's needed, instead of
  // duplicating this per entry point.
  async function applyPickedExercise(ex) {
    if (swapIndex != null) {
      if (!(await swapEntry(ex))) return false
      setSwapIndex(null)
    } else {
      setEntries((prev) => [...prev, buildEntryFromExercise(ex)])
    }
    setSwapPickId('')
    return true
  }

  function updateSet(entryIdx, setIdx, patch) {
    setEntries((prev) =>
      prev.map((e, i) =>
        i !== entryIdx
          ? e
          : { ...e, sets: e.sets.map((s, j) => (j === setIdx ? { ...s, ...patch } : s)) },
      ),
    )
  }

  function updateNote(entryIdx, text) {
    setEntries((prev) => prev.map((e, i) => (i !== entryIdx ? e : { ...e, notes: text })))
  }

  function addSet(entryIdx) {
    setEntries((prev) =>
      prev.map((e, i) => (i !== entryIdx ? e : { ...e, sets: [...e.sets, emptySet(e.category)] })),
    )
  }

  // Warm-ups go at the start of the exercise, ahead of the working sets.
  function addWarmups(entryIdx, warmups) {
    setEntries((prev) => prev.map((e, i) => (i !== entryIdx ? e : { ...e, sets: [...warmups, ...e.sets] })))
  }

  // Undo puts back just the removed piece, so anything typed since stays.
  function removeSet(entryIdx, setIdx) {
    const entry = entries[entryIdx]
    const removed = entry?.sets[setIdx]
    if (!removed) return
    setEntries((prev) =>
      prev.map((e, i) => (i !== entryIdx ? e : { ...e, sets: e.sets.filter((_, j) => j !== setIdx) })),
    )
    toast(t('workout.setRemoved'), 'success', {
      label: t('workout.undo'),
      // Back into the one card it came from: the same position if that card
      // hasn't moved, else the first card of that exercise.
      onClick: () =>
        setEntries((prev) => {
          const i = prev[entryIdx]?.exerciseId === entry.exerciseId ? entryIdx : prev.findIndex((e) => e.exerciseId === entry.exerciseId)
          if (i < 0 || prev[i].sets.includes(removed)) return prev
          const sets = prev[i].sets
          const at = Math.min(setIdx, sets.length)
          return prev.map((e, j) => (j !== i ? e : { ...e, sets: [...sets.slice(0, at), removed, ...sets.slice(at)] }))
        }),
    })
  }

  function moveEntry(entryIdx, dir) {
    setEntries((prev) => {
      const target = entryIdx + dir
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[entryIdx], next[target]] = [next[target], next[entryIdx]]
      return next
    })
  }

  async function removeEntry(entryIdx) {
    const entry = entries[entryIdx]
    // Only ask when there's something to lose — removing an untouched
    // exercise shouldn't need a confirmation.
    const hasLogged = workingSets(entry?.sets).some((s) =>
      entry.category === 'cardio' ? s.duration : s.weight || s.reps,
    )
    if (hasLogged) {
      const ok = await confirm({
        title: t('workout.removeEntryTitle', { name: liveName(entry) }),
        body: t('workout.removeEntryBody'),
        confirmLabel: t('common.remove'),
        danger: true,
      })
      if (!ok) return
    }
    setEntries((prev) => prev.filter((_, i) => i !== entryIdx))
    toast(t('workout.entryRemoved', { name: liveName(entry) }), 'success', {
      label: t('workout.undo'),
      onClick: () =>
        // Tapping Undo twice must not bring the card back twice.
        setEntries((prev) => (prev.includes(entry) ? prev : [...prev.slice(0, entryIdx), entry, ...prev.slice(entryIdx)])),
    })
  }

  async function clearLastNote(exerciseId) {
    try {
      await clearExerciseNote(effectiveUid, exerciseId)
      refreshExercises()
    } catch (err) {
      console.error(err)
      toast(t('sessionCard.clearNoteFailed'), 'error')
    }
  }

  async function handleFinish() {
    // Sets that won't be saved as typed: planned but empty are dropped, and
    // ones with numbers but no tick are saved as done. Say so once, up front.
    let dropped = 0
    let unticked = 0
    let completed = 0
    for (const e of entries) {
      for (const s of e.sets || []) {
        if (isCompletedSet(e, s)) completed++
      }
      for (const s of workingSets(e.sets)) {
        if (!isCompletedSet(e, s)) dropped++
        else if (!s.done) unticked++
      }
    }
    // With nothing savable at all, the save itself explains that.
    if (completed > 0 && (dropped > 0 || unticked > 0)) {
      const lines = []
      if (dropped) lines.push(t(dropped === 1 ? 'workout.finishUnfilledOne' : 'workout.finishUnfilledMany', { n: dropped }))
      if (unticked) lines.push(t(unticked === 1 ? 'workout.finishUntickedOne' : 'workout.finishUntickedMany', { n: unticked }))
      const ok = await confirm({
        title: t('workout.finishCheckTitle'),
        body: lines.join('\n'),
        confirmLabel: t('workout.finishSaveAnyway'),
      })
      if (!ok) return
    }
    setSaving(true)
    try {
      // The recap is a bonus: if building it ever fails, saving carries on
      // and we go to History exactly as before.
      let summaryData = null
      try {
        summaryData = buildSummary({
          entries: entries.map((e) => ({ ...e, name: liveName(e) })),
          personalBests,
          pastSets: pastStrengthSets,
          routineName: isFreestyle ? t('workout.freestyleSession') : routine?.name,
          date,
          durationMinutes: finalDuration(),
          // No streak while past workouts are still loading (or failed to load).
          streakWeeks: pastLoading ? null : weeklyStreak(pastSessions, date),
          minLabel: t('sessionCard.minUnit'),
          bwLabel: t('sessionCard.bwShort'),
        })
        if (!summaryData.rows.length) summaryData = null
      } catch (err) {
        console.error(err)
      }
      await logSession(effectiveUid, {
        id: sessionId,
        routineId: isFreestyle ? null : routine?.id,
        routineName: isFreestyle ? 'Freestyle' : routine?.name,
        category,
        date,
        notes,
        startedAt: isLive ? new Date(startedAt).toISOString() : null,
        durationMinutes: finalDuration(),
        gymId,
        entries: entries.map((e) => ({
          exerciseId: e.exerciseId,
          name: e.name,
          nameEn: e.nameEn,
          nameHe: e.nameHe || null,
          unit: e.unit,
          category: e.category || 'strength',
          bodyweight: e.bodyweight,
          timed: !!e.timed,
          intensityType: e.intensityType,
          videoUrl: e.videoUrl,
          notes: e.notes || '',
          ...(e.coachNote ? { coachNote: e.coachNote } : {}),
          // The routine's target rides along so the coach reviewing the
          // session sees what was asked for, even after the routine changes.
          ...(e.targetSets ? { targetSets: e.targetSets } : {}),
          ...(e.targetReps != null && e.targetReps !== '' ? { targetReps: e.targetReps } : {}),
          ...(e.targetRir != null ? { targetRir: e.targetRir } : {}),
          // `done` is only the on-screen tick; it isn't part of a saved set.
          sets: e.sets.map(({ done, ...set }) => set),
        })),
      })
      clearDraft(effectiveUid, draftKey)
      clearSavedRest()
      setSaved(true)
      toast(t('workout.sessionSaved'))
      // Show the recap (with Share) instead of jumping straight to History.
      if (summaryData) setSummary(summaryData)
      else navigate('/history')
    } catch (err) {
      console.error(err)
      // The draft is only cleared on success, so a failed save (usually
      // patchy gym signal) never loses anything — say so, so nobody
      // panics and starts re-typing their whole workout.
      if (err?.message === 'EMPTY_SESSION') toast(t('workout.nothingLogged'), 'error')
      else toast(t('workout.saveFailedKept'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDiscard() {
    const ok = await confirm({
      title: t('workout.discardTitle'),
      body: t('workout.discardBody'),
      confirmLabel: t('workout.discardConfirm'),
      danger: true,
    })
    if (!ok) return
    clearDraft(effectiveUid, draftKey)
    clearSavedRest()
    navigate('/')
  }

  // A failed load is not a missing routine: keep the draft and offer a retry,
  // so a bad connection at the gym never throws away a half-logged workout.
  if (!isFreestyle && !routinesLoading && !routine && routinesError) {
    return <LoadError onRetry={refreshRoutines} />
  }

  if (!isFreestyle && !routinesLoading && !routine) {
    const draft = loadDraft(effectiveUid, draftKey)
    if (draft?.routineId === routineId) clearDraft(effectiveUid, draftKey)
    return <p className="text-chalkdim">{t('workout.routineNotFound')}</p>
  }

  if (summary) return <WorkoutDone summary={summary} onDone={() => navigate('/history', { replace: true })} />

  const availableToAdd = exercises.filter((e) => !entries.some((en) => en.exerciseId === e.id))
  const exerciseOptions = availableToAdd.map((e) => ({
    id: e.id,
    label: `${(lang === 'he' && e.name_he) || e.name}${e.category !== 'strength' ? ` (${e.category})` : ''}`,
    // The other language's name, so English terms still find it in Hebrew.
    alt: (lang === 'he' ? e.name : e.name_he) || '',
  }))
  // Most-used first, counted per past workout; only ones not in this workout.
  const recentIds = (() => {
    const counts = new Map()
    for (const s of pastSessions) for (const en of s.entries || []) counts.set(en.exerciseId, (counts.get(en.exerciseId) || 0) + 1)
    return availableToAdd
      .filter((e) => counts.has(e.id))
      .sort((a, b) => counts.get(b.id) - counts.get(a.id))
      .slice(0, 8)
      .map((e) => e.id)
  })()
  const recentGroups = recentIds.length ? [{ label: t('workout.addSheetRecent'), ids: recentIds }] : undefined

  const allWorking = entries.flatMap((e) => workingSets(e.sets))
  const doneCount = allWorking.filter((x) => x.done).length
  const progressPct = allWorking.length ? Math.round((doneCount / allWorking.length) * 100) : 0
  const title = isFreestyle ? t('workout.freestyleSession') : routine?.name
  const dateLabel = fmtDate(lang, new Date(date + 'T00:00:00'), { day: 'numeric', month: 'short' })
  function openDatePicker() {
    const el = dateInputRef.current
    if (!el) return
    try {
      el.showPicker()
    } catch {
      el.focus()
      el.click()
    }
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-3 max-w-2xl pb-48">
        <header className="grid grid-cols-[88px_minmax(0,1fr)_88px] items-center -mx-2">
          <Link
            to="/"
            // Leaving keeps the draft; say so, so it doesn't feel like a loss.
            onClick={() => {
              if (!saved && entries.some((e) => e.sets.some((s) => setHasLogged(e, s)))) toast(t('workout.leftSaved'))
            }}
            aria-label={t('common.close')}
            title={t('common.close')}
            className="press w-11 h-11 flex items-center justify-center text-chalkdim hover:text-chalk"
          >
            <X size={22} strokeWidth={1.75} />
          </Link>
          <div className="flex flex-col items-center min-w-0">
            <h1 className="text-[15px] leading-5 font-semibold truncate max-w-full">{title}</h1>
            <p className="text-[13px] leading-[18px] text-chalkdim num flex items-center gap-1 max-w-full">
              {elapsedMin != null && elapsedMin <= 300 && (
                <>
                  <span className="truncate">{t('workout.elapsed', { min: elapsedMin })}</span>
                  <span aria-hidden="true">·</span>
                </>
              )}
              <button
                type="button"
                onClick={openDatePicker}
                aria-label={t('workout.date')}
                className="hit hover:text-chalk transition-colors whitespace-nowrap"
              >
                {dateLabel}
              </button>
              <input
                ref={dateInputRef}
                type="date"
                value={date}
                onChange={(e) => e.target.value && setDate(e.target.value)}
                tabIndex={-1}
                aria-hidden="true"
                className="sr-only"
              />
            </p>
          </div>
          <button
            type="button"
            onClick={handleFinish}
            disabled={saving || saved || entries.length === 0 || (gymsOn && gymChoice === undefined)}
            className="press justify-self-end h-11 px-3 text-[15px] font-semibold text-accent disabled:opacity-40 disabled:pointer-events-none"
          >
            {saved ? t('workout.saved') : saving ? t('workout.saving') : t('workout.finish')}
          </button>
        </header>

        {staleSince && (
          <div className="rounded-xl bg-surface2 px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]" role="status">
            <p className="text-chalk flex-1 min-w-[200px]">
              {t('workout.staleDraft', { date: fmtDate(lang, new Date(staleSince), { day: 'numeric', month: 'short' }) })}
            </p>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => {
                  // Time since now, so a long-abandoned start doesn't skew the duration.
                  setStartedAt(Date.now())
                  setStaleSince(null)
                }}
                className="press min-h-[44px] px-3 font-semibold text-accent"
              >
                {t('workout.staleKeep')}
              </button>
              <button type="button" onClick={startFresh} className="press min-h-[44px] px-3 text-chalkdim hover:text-chalk">
                {t('workout.staleFresh')}
              </button>
            </div>
          </div>
        )}

        {gymsOn && gymChoice !== undefined && (
          <label className="relative self-center inline-flex items-center gap-1.5 h-9 ps-3 pe-2.5 rounded-full bg-surface2 text-[13px] font-medium text-chalk focus-within:ring-2 focus-within:ring-accent">
            <MapPin size={14} className="text-accent" aria-hidden="true" />
            <span className="sr-only">{t('gyms.pickerLabel')}</span>
            <span className="truncate max-w-[60vw]">{gymLabel(gymId, gyms, mainName, t)}</span>
            <ChevronDown size={14} className="text-chalkdim" aria-hidden="true" />
            <select
              value={gymId || ''}
              onChange={(e) => {
                const next = e.target.value || null
                setGymChoice(next)
                // The Previous numbers change under the lifter's feet; say so.
                toast(t('workout.gymPreviousFrom', { gym: gymLabel(next, gyms, mainName, t) }))
              }}
              className="absolute inset-0 opacity-0 cursor-pointer"
            >
              <option value="">{gymLabel(null, gyms, mainName, t)}</option>
              {gyms.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="h-[3px] rounded-full bg-surface2 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={allWorking.length} aria-valuenow={doneCount}>
          <div className="h-full rounded-full bg-accent transition-[width] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none" style={{ width: `${progressPct}%` }} />
        </div>

        {entries.map((entry, i) => (
          <div
            key={entry.uid || entry.exerciseId + i}
            ref={(el) => (entryRefs.current[i] = el)}
            className={`scroll-mt-4 rounded-[22px] ${glowIdx === i ? 'jump-glow' : ''}`}
          >
          <SessionEntryCard
            entry={entry}
            liveExercise={gymExercises.find((e) => e.id === entry.exerciseId)}
            previousFrom={(() => {
              const from = gymExercises.find((e) => e.id === entry.exerciseId)?.fromGymId
              return from !== undefined && from !== gymId ? gymLabel(from, gyms, mainName, t) : null
            })()}
            personalBest={personalBests[entry.exerciseId]}
            pastSets={pastStrengthSets[entry.exerciseId]}
            removable
            supersetPos={supersetPos(entries, i)}
            onMoveUp={i > 0 ? () => moveEntry(i, -1) : undefined}
            onMoveDown={i < entries.length - 1 ? () => moveEntry(i, 1) : undefined}
            onUpdateSet={(setIdx, patch) => updateSet(i, setIdx, patch)}
            onAddSet={() => addSet(i)}
            onAddWarmups={(sets) => addWarmups(i, sets)}
            onRemoveSet={(setIdx) => removeSet(i, setIdx)}
            onRemoveEntry={() => removeEntry(i)}
            onUpdateNote={(text) => updateNote(i, text)}
            onSetDone={(setIdx) => handleSetDone(i, setIdx)}
            onToggleSuperset={i < entries.length - 1 ? () => toggleSuperset(i) : undefined}
            onClearLastNote={() => clearLastNote(entry.exerciseId)}
            onSwapExercise={() => {
              setSwapIndex(i)
              setSwapPickId('')
            }}
          />
          </div>
        ))}

        {/* Also available inside a planned routine: adding here affects
            THIS session only — the routine itself is untouched, same as
            swapping. */}
        <div className="flex flex-col gap-2">
          <Button type="button" variant="ghost" className="w-full min-h-[48px]" onClick={() => setShowAddSheet(true)}>
            <Plus size={16} /> {t('workout.addExercise')}
          </Button>
          {!isFreestyle && <p className="text-chalkdim text-xs text-center">{t('workout.addOneOffNote')}</p>}
        </div>

        <Card>
          <Field
            label={
              <>
                {t('workout.sessionNotes')} <InfoTip text={t('workout.sessionNotesTip')} />
              </>
            }
          >
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('workout.sessionNotesPlaceholder')}
              rows={2}
            />
          </Field>
        </Card>

        {/* After a long workout the thumb is at the bottom of the page, so the
            main action lives here too, not only in the header. */}
        <Button
          type="button"
          variant="brass"
          className="w-full h-[52px] text-base"
          onClick={handleFinish}
          disabled={saving || saved || entries.length === 0 || (gymsOn && gymChoice === undefined)}
        >
          {saved ? t('workout.saved') : saving ? t('workout.saving') : t('workout.finishWorkout')}
        </Button>

        <div className="flex items-center justify-center">
          <Button type="button" variant="danger" onClick={handleDiscard} disabled={saving || saved}>
            {t('workout.discard')}
          </Button>
        </div>
      </div>

      {swapIndex != null && !showLibraryPicker && !creatingCustom && (
        <ModalShell onClose={() => setSwapIndex(null)} label="swap-title">
          <div className="card p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 id="swap-title" className="text-2xl mb-2">{t('workout.swapTitle')}</h2>
            <p className="text-chalkdim text-sm mb-4">
              {t('workout.swapSubtitle', { name: swapIndex != null ? liveName(entries[swapIndex]) : '' })}
            </p>
            <Field label={t('workout.swapPickLabel')}>
              <ExerciseSelect
                value={swapPickId}
                onChange={setSwapPickId}
                options={exerciseOptions}
                groups={recentGroups}
                restLabel={t('workout.addSheetAll')}
                placeholder={t('workout.chooseFromLibrary')}
              />
            </Field>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
              <button
                type="button"
                onClick={() => setShowLibraryPicker(true)}
                className="text-chalkdim hover:text-chalk text-sm inline-flex items-center gap-1"
              >
                <Library size={14} /> {t('routines.browseLibrary')}
              </button>
              {/* Same destination as the catalogue's "can't find it?" link,
                  surfaced directly here — swapping usually happens because
                  a machine is taken, and the replacement often isn't in
                  anyone's list yet. */}
              <button type="button" onClick={() => setCreatingCustom(true)} className="text-chalkdim hover:text-chalk text-sm inline-flex items-center gap-1">
                <Plus size={14} /> {t('exercises.cantFind')}
              </button>
            </div>
            <p className="text-chalkdim text-xs mt-2">{t('workout.swapNote')}</p>
            <div className="flex justify-end gap-2 mt-5">
              <Button type="button" variant="ghost" onClick={() => setSwapIndex(null)}>
                {t('common.cancel')}
              </Button>
              <Button type="button" onClick={performSwap} disabled={!swapPickId}>
                {t('workout.swapConfirm')}
              </Button>
            </div>
          </div>
        </ModalShell>
      )}

      {showAddSheet && (
        <AddExerciseSheet
          options={exerciseOptions}
          recentIds={recentIds}
          onPick={addFromSheet}
          onBrowse={() => {
            setShowAddSheet(false)
            setShowLibraryPicker(true)
          }}
          onClose={() => setShowAddSheet(false)}
          t={t}
        />
      )}

      {showLibraryPicker && (
        <ExercisePicker
          existingNames={exercises.map((e) => e.name)}
          onAdd={async (g) => {
            const wasSwapping = swapIndex != null
            const ex = await addExercise(effectiveUid, {
              name: g.name,
              nameHe: g.nameHe,
              category: g.category,
              unit: g.unit,
              bodyweight: g.bodyweight,
              timed: g.timed,
              intensityType: g.intensity_type,
              videoUrl: '',
              notes: '',
            })
            refreshExercises()
            await applyPickedExercise(ex)
            // A swap is a single "replace this one" action, so close
            // right after — but adding freely (freestyle) stays open,
            // matching how the library picker behaves everywhere else in
            // the app, so several exercises can be added in one go.
            if (wasSwapping) setShowLibraryPicker(false)
          }}
          onCreateCustom={() => {
            setShowLibraryPicker(false)
            setCreatingCustom(true)
          }}
          onClose={() => setShowLibraryPicker(false)}
        />
      )}

      {creatingCustom && (
        <ExerciseModal
          initial={{ ...emptyExerciseForm, category: swapIndex != null ? entries[swapIndex]?.category || 'strength' : category }}
          existingExercises={exercises}
          onClose={() => setCreatingCustom(false)}
          onSave={async (data) => {
            const ex = await addExercise(effectiveUid, data)
            refreshExercises()
            if (await applyPickedExercise(ex)) setCreatingCustom(false)
          }}
        />
      )}

      {((jumpArmed && !currentInView) || jumpLeaving) && currentIdx >= 0 && (
        <button
          type="button"
          onClick={jumpToCurrent}
          aria-label={t('workout.jumpToCurrent', { name: liveName(entries[currentIdx]) })}
          title={t('workout.jumpToCurrent', { name: liveName(entries[currentIdx]) })}
          className={`jump-pill ${jumpLeaving ? 'jump-leave' : 'press'} fixed inset-x-0 mx-auto z-30 w-12 h-12 flex items-center justify-center rounded-full bg-[#242428]/85 backdrop-blur-xl text-accent shadow-[inset_0_0.5px_0_rgba(255,255,255,0.14),0_8px_24px_rgba(0,0,0,0.45)]`}
          // Sits just above where the rest timer opens, so the two never overlap.
          style={{ bottom: 'calc(max(24px, calc(env(safe-area-inset-bottom, 0px) + 12px)) + 80px)' }}
        >
          {currentAbove ? <ArrowUp size={22} aria-hidden="true" /> : <ArrowDown size={22} aria-hidden="true" />}
        </button>
      )}

      <RestTimer ref={restRef} />
    </div>
  )
}
