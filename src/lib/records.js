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
  for (const p of past || []) if (p.weight >= w && p.reps > most) most = p.reps
  return r > most ? 'reps' : null
}
