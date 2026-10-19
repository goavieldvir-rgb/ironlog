import { workingSets } from './warmup.js'
import { isFreestyleSession } from './names.js'
import { cardioSummary } from './cardio.js'

// Comparing a saved workout with earlier workouts of the same kind, for the
// coach reviewing it (and the trainee looking back). Everything here works on
// the sessions already loaded for the history page, so no extra queries.

const num = (v) => (v === '' || v == null ? NaN : Number(v))
const has = (v) => v !== '' && v != null

const earlier = (o, session) =>
  o.date < session.date || (o.date === session.date && (o.created_at || '') < (session.created_at || ''))

// Earlier sessions of the same routine, newest first. Matched by routine id,
// plus same-name sessions saved without one; a freestyle workout has no
// "same kind", so it gets none.
export function sameKindSessions(session, sessions) {
  if (!session || isFreestyleSession(session)) return []
  return (sessions || [])
    .filter((o) => {
      if (o.id === session.id || !earlier(o, session)) return false
      if (session.routine_id && o.routine_id) return o.routine_id === session.routine_id
      return o.routine_name === session.routine_name
    })
    .sort((a, b) => (a.date === b.date ? (b.created_at || '').localeCompare(a.created_at || '') : b.date.localeCompare(a.date)))
}

// The entry for the same exercise in another session.
export function matchingEntry(entry, other) {
  const list = other?.entries || []
  if (entry.exerciseId) return list.find((e) => e.exerciseId === entry.exerciseId) || null
  return list.find((e) => !e.exerciseId && (e.nameEn || e.name) === (entry.nameEn || entry.name)) || null
}

// What the routine asked for on this exercise. Sessions saved from now on
// carry their own target; older ones fall back to the routine as it is today
// (`fromRoutine` says so, since it may have changed since).
export function targetFor(entry, routine) {
  if (entry.category === 'cardio') return null
  if (entry.targetSets) {
    return { sets: entry.targetSets, reps: has(entry.targetReps) ? entry.targetReps : null, rir: entry.targetRir ?? null, fromRoutine: false }
  }
  const it = routine?.exercises?.find((x) => (entry.exerciseId ? x.exerciseId === entry.exerciseId : x.name === entry.name))
  if (!it || !it.targetSets) return null
  return {
    sets: it.targetSets,
    reps: has(it.targetReps) ? it.targetReps : null,
    rir: entry.targetRir ?? (has(it.targetRir) ? Number(it.targetRir) : null),
    fromRoutine: true,
  }
}

// One number per exercise per workout to chart and compare: the top set's
// weight (with its reps), reps for bodyweight, seconds for timed holds,
// minutes for cardio. `volume` is weight x reps over the working sets.
export function entryStats(entry) {
  if (!entry) return null
  const sets = workingSets(entry.sets)
  if (entry.category === 'cardio') {
    const c = cardioSummary(sets)
    if (!c) return null
    return { kind: 'cardio', top: c.minutes, distance: c.distance, sets: sets.length }
  }
  const valid = sets.filter((s) => has(s.reps))
  if (valid.length === 0) return null
  const totalReps = valid.reduce((n, s) => n + (num(s.reps) || 0), 0)
  if (entry.timed) {
    return { kind: 'timed', top: Math.max(...valid.map((s) => num(s.reps) || 0)), sets: valid.length, totalReps }
  }
  if (entry.bodyweight) {
    const top = valid.reduce((b, s) => ((num(s.reps) || 0) > (num(b.reps) || 0) ? s : b), valid[0])
    return { kind: 'bodyweight', top: num(top.reps) || 0, topWeight: num(top.weight) || 0, sets: valid.length, totalReps }
  }
  // Heaviest set, and the most reps among sets at that weight.
  const top = valid.reduce((b, s) => {
    const w = num(s.weight) || 0
    const bw = num(b.weight) || 0
    return w > bw || (w === bw && (num(s.reps) || 0) > (num(b.reps) || 0)) ? s : b
  }, valid[0])
  return {
    kind: 'weight',
    top: num(top.weight) || 0,
    topReps: num(top.reps) || 0,
    sets: valid.length,
    totalReps,
    volume: Math.round(valid.reduce((v, s) => v + (num(s.weight) || 0) * (num(s.reps) || 0), 0)),
  }
}

// How this workout's exercise moved against an earlier one: 'up', 'down' or
// 'same', judged on the top set first and then on the work done around it.
export function trend(now, before) {
  if (!now || !before || now.kind !== before.kind) return null
  const cmp = (a, b) => (a > b ? 'up' : a < b ? 'down' : null)
  if (now.kind === 'weight') return cmp(now.top, before.top) || cmp(now.topReps, before.topReps) || cmp(now.volume, before.volume) || 'same'
  if (now.kind === 'cardio') return cmp(now.top, before.top) || cmp(now.distance || 0, before.distance || 0) || 'same'
  return cmp(now.top, before.top) || cmp(now.totalReps, before.totalReps) || 'same'
}

// Total weight x reps for a whole workout, or null when it mixes kilos and
// pounds (they can't be added) or has no weighted work.
export function sessionVolume(session) {
  let total = 0
  let unit = null
  for (const e of session?.entries || []) {
    if (e.category === 'cardio' || e.timed) continue
    const v = workingSets(e.sets).reduce((sum, s) => sum + (num(s.weight) || 0) * (num(s.reps) || 0), 0)
    if (v <= 0) continue
    if (unit && unit !== e.unit) return null
    unit = e.unit
    total += v
  }
  return total > 0 ? { value: Math.round(total), unit } : null
}
