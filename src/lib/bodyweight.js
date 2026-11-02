// Body weight for bodyweight exercises (pull-ups, dips, push-ups).
//
// A bodyweight set stores only the ADDED load in `set.weight` (dip belt,
// vest), exactly as before. When the workout is saved, the trainee's body
// weight from the weight log is stamped on the entry as `entry.bodyWeight`
// (already in the entry's unit), so the set's real load is
// bodyWeight + added. Older entries have no stamp and keep counting only
// the added weight, so nothing already logged changes.

const KG_PER_LB = 0.45359237

export function convertWeight(w, from, to) {
  const n = Number(w)
  if (!isFinite(n)) return null
  if (!from || !to || from === to) return n
  if (from === 'lb' && to === 'kg') return n * KG_PER_LB
  if (from === 'kg' && to === 'lb') return n / KG_PER_LB
  return n
}

const round1 = (n) => Math.round(n * 10) / 10

// The weigh-in that applies to a workout on `date` (YYYY-MM-DD): the latest
// one on or before that day, else the earliest one after it (a workout
// logged for a day before the first weigh-in). null when nothing is logged.
export function bodyWeightFor(logs, date) {
  const valid = (logs || []).filter((l) => Number(l.weight) > 0 && l.date)
  if (valid.length === 0) return null
  const byNewest = [...valid].sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? 1 : -1) : (a.created_at || '') < (b.created_at || '') ? 1 : -1,
  )
  const pick = byNewest.find((l) => !date || l.date <= date) || byNewest[byNewest.length - 1]
  return { weight: Number(pick.weight), unit: pick.unit || 'kg', date: pick.date }
}

// The weigh-in expressed in an exercise's unit, rounded to 0.1.
export function bodyWeightIn(bw, unit) {
  if (!bw) return null
  const v = convertWeight(bw.weight, bw.unit, unit || 'kg')
  return v > 0 ? round1(v) : null
}

// Does this entry count body weight as part of the load? Timed holds don't
// (their "reps" are seconds) and cardio never does.
export function usesBodyWeight(entry) {
  return !!entry?.bodyweight && !entry.timed && entry.category !== 'cardio'
}

// The load one set moved: body weight (when stamped) plus the set's weight.
export function setLoad(entry, set) {
  const added = Number(set?.weight)
  const base = usesBodyWeight(entry) && Number(entry.bodyWeight) > 0 ? Number(entry.bodyWeight) : 0
  return base + (isFinite(added) ? added : 0)
}

// load × reps for one set; 0 when either is missing.
export function setVolume(entry, set) {
  const r = Number(set?.reps)
  if (!isFinite(r) || r <= 0) return 0
  return setLoad(entry, set) * r
}
