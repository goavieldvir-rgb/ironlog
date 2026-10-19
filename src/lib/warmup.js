// Warm-up sets are flagged with `warmup: true` on the set itself (sets live
// in jsonb, so no migration). They're shown, but never count toward PRs,
// "last time" numbers, volume or set counts.
export const isWarmup = (set) => !!set?.warmup
export const workingSets = (sets) => (sets || []).filter((s) => !isWarmup(s))

// Two warm-up sets toward the working weight: about 50% x5, then 75% x3,
// each rounded down to a loadable step (the smallest plate jump). When the
// first step is at or below the empty bar, the bar x10 takes its place. A
// warm-up is never as heavy as the real set, so a step that isn't lighter
// than the working weight is dropped.
export const WARMUP_SETS = 2

export function suggestWarmups(workingWeight, unit) {
  const w = Number(workingWeight)
  if (!isFinite(w) || w <= 0) return []
  const lb = unit === 'lb'
  const bar = lb ? 45 : 20
  const step = lb ? 5 : 2.5
  const ladder = [
    { pct: 0.5, reps: 5 },
    { pct: 0.75, reps: 3 },
  ]
  let steps = ladder.map(({ pct, reps }) => ({ weight: Math.floor((w * pct) / step) * step, reps }))
  if (w > bar) {
    steps = [{ weight: bar, reps: 10 }, ...steps.filter((s) => s.weight > bar)]
    if (steps.length > WARMUP_SETS) steps = steps.slice(1)
  }
  const seen = new Set()
  return steps
    .filter((s) => {
      if (s.weight >= w || s.weight <= 0 || seen.has(s.weight)) return false
      seen.add(s.weight)
      return true
    })
    .slice(0, WARMUP_SETS)
}
