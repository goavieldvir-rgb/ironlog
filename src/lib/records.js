import { isWarmup } from './warmup.js'

// What kind of personal record a set is, if any. Weight PR: heavier than
// anything lifted before. Reps PR: not heavier, but more reps than ever done
// at that weight or heavier (e.g. 120 kg × 18 when 125 kg × 10 is your
// heaviest). Cardio, timed and bodyweight moves have a single number, so
// they only ever have a plain 'weight' (best value) PR.
export function prKind(set, { single, best, past }) {
  if (best == null) return null
  if (single) {
    const v = Number(set.duration ?? set.reps ?? set.weight)
    return isFinite(v) && v > best ? 'weight' : null
  }
  const w = Number(set.weight)
  const r = Number(set.reps)
  if (!set.weight || !isFinite(w) || w <= 0) return null
  if (w > best) return 'weight'
  if (!set.reps || !isFinite(r) || r <= 0) return null
  let most = 0
  let found = false
  for (const p of past || []) {
    if (p.weight < w) continue
    found = true
    if (p.reps > most) most = p.reps
  }
  // No earlier set at this weight or heavier to beat: nothing to call a record.
  return found && r > most ? 'reps' : null
}

// The record kind of one set of a workout entry, with the same inputs the
// workout screen's badges use: the entry (category / bodyweight), the set,
// the exercise's all-time best and its earlier weighted sets. Warm-ups never
// count. The workout screen and the saved-workout recap both call this, so
// they can never disagree.
export function entryPrKind(entry, set, best, past) {
  if (isWarmup(set)) return null
  const isCardio = entry.category === 'cardio'
  if (isCardio || entry.bodyweight) {
    const raw = isCardio ? set.duration : set.reps
    const n = Number(raw)
    const v = raw !== '' && raw != null && isFinite(n) ? n : null
    return v != null && best != null && v > best ? 'weight' : null
  }
  return prKind(set, { single: false, best, past })
}
