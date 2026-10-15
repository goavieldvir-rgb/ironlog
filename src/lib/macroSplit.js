// Splits the daily calorie target between carbs, protein and fat by
// percentage. Pure functions, so the rules can be checked without the UI.

export const MACROS = ['carbs', 'protein', 'fat']
export const KCAL_PER_G = { carbs: 4, protein: 4, fat: 9 }
export const DEFAULT_SPLIT = { carbs: 40, protein: 40, fat: 20 }

export const splitTotal = (s) => MACROS.reduce((a, k) => a + s[k], 0)

// Whole percentages that add up to exactly 100, from any non-negative weights.
// Largest remainder: floor everything, then hand the missing points to the
// biggest fractions, so no value moves by more than one point.
function toWholePercents(weights) {
  const sum = MACROS.reduce((a, k) => a + weights[k], 0)
  if (!(sum > 0)) return { ...DEFAULT_SPLIT }
  const raw = MACROS.map((k) => [k, (weights[k] / sum) * 100])
  const out = Object.fromEntries(raw.map(([k, v]) => [k, Math.floor(v)]))
  let left = 100 - splitTotal(out)
  raw
    .map(([k, v]) => [k, v - Math.floor(v)])
    .sort((a, b) => b[1] - a[1])
    .forEach(([k]) => {
      if (left > 0) {
        out[k] += 1
        left -= 1
      }
    })
  return out
}

// Sets one macro and shares the rest between the other two in proportion to
// their values in `anchor` (the split before the user started moving this
// slider), so their ratio holds however far the slider travels. Anchoring
// matters: re-deriving from the previous step's rounded values lets the
// ratio drift one point at a time. Always returns whole numbers totalling 100.
export function setMacroPct(anchor, key, value) {
  const v = Math.min(100, Math.max(0, Math.round(Number(value) || 0)))
  const [a, b] = MACROS.filter((k) => k !== key)
  const rest = 100 - v
  const sum = anchor[a] + anchor[b]
  // Both others at 0: nothing to keep in proportion, so share evenly.
  const share = sum > 0 ? anchor[a] / sum : 0.5
  const va = Math.round(rest * share)
  // The rounding difference lands on the second macro, which keeps the
  // total exact without touching the one the user is holding.
  return { [key]: v, [a]: va, [b]: rest - va }
}

// Daily gram target for one macro at this calorie goal (unrounded).
export function macroGrams(kcal, pct, key) {
  const k = Number(kcal)
  if (!(k > 0)) return null
  return (k * pct) / 100 / KCAL_PER_G[key]
}

// The split a saved set of gram targets represents, or the 40/40/20 default
// when there is nothing to read it from. Saved grams are whole numbers, so
// the percentages are rounded back to whole points that total 100.
export function splitFromTargets(targets) {
  const kcal = Number(targets?.kcal)
  const has = MACROS.some((k) => targets?.[k] != null)
  if (!(kcal > 0) || !has) return { ...DEFAULT_SPLIT }
  return toWholePercents(Object.fromEntries(MACROS.map((k) => [k, (Number(targets[k]) || 0) * KCAL_PER_G[k]])))
}
