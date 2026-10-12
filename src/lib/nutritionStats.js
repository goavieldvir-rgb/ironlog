import { supabase } from '../supabase.js'
import { toLocalISODate, weekStartOf } from './dates.js'

// Week and month averages for the nutrition diary. Only finished days count:
// today is still being eaten and later days are planned, so both stay out of
// averages and goal adherence.

// Calories count as on target within this share of the target, either way.
export const KCAL_BAND = 0.1

export const shiftDay = (iso, n) => {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return toLocalISODate(d)
}

// Same week start as the Stats page (Sunday).
export function periodRange(kind, anchor) {
  const d = new Date(anchor + 'T00:00:00')
  if (kind === 'month') {
    const from = new Date(d.getFullYear(), d.getMonth(), 1)
    const to = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    return { from: toLocalISODate(from), to: toLocalISODate(to) }
  }
  const from = weekStartOf(anchor)
  return { from, to: shiftDay(from, 6) }
}

// Any day inside the previous / next period.
export function shiftPeriod(kind, from, n) {
  if (kind === 'month') {
    const d = new Date(from + 'T00:00:00')
    return toLocalISODate(new Date(d.getFullYear(), d.getMonth() + n, 1))
  }
  return shiftDay(from, 7 * n)
}

export function daysBetween(from, to) {
  const out = []
  for (let d = from; d <= to; d = shiftDay(d, 1)) out.push(d)
  return out
}

function check({ data, error }) {
  if (error) throw error
  return data
}

export async function getLogTotalsRange(uid, from, to) {
  return check(
    await supabase
      .from('food_logs')
      .select('date, kcal, protein, carbs, fat')
      .eq('user_id', uid)
      .gte('date', from)
      .lte('date', to)
      .limit(5000),
  )
}

export function kcalOnTarget(kcal, target) {
  return target > 0 && Math.abs(kcal - target) <= target * KCAL_BAND
}

// days: one row per calendar day of the period, with the day's totals.
// Averages are over finished days that have food logged; water over finished
// days with water logged.
export function periodStats({ from, to, today, foodRows, waterRows, targets, waterGoal }) {
  const byDay = new Map(daysBetween(from, to).map((d) => [d, { date: d, kcal: 0, protein: 0, carbs: 0, fat: 0, n: 0, ml: 0, wn: 0 }]))
  for (const r of foodRows || []) {
    const d = byDay.get(r.date)
    if (!d) continue
    d.kcal += Number(r.kcal) || 0
    d.protein += Number(r.protein) || 0
    d.carbs += Number(r.carbs) || 0
    d.fat += Number(r.fat) || 0
    d.n++
  }
  for (const r of waterRows || []) {
    const d = byDay.get(r.date)
    if (!d) continue
    d.ml += Number(r.ml) || 0
    d.wn++
  }
  const days = [...byDay.values()].map((d) => ({ ...d, finished: d.date < today, future: d.date > today }))
  const done = days.filter((d) => d.finished)
  const fed = done.filter((d) => d.n > 0)
  const watered = done.filter((d) => d.wn > 0)
  const avg = (rows, k) => (rows.length ? rows.reduce((s, d) => s + d[k], 0) / rows.length : 0)
  const tp = targets?.protein
  const tk = targets?.kcal
  return {
    days,
    finishedDays: done.length,
    loggedDays: fed.length,
    avg: { kcal: avg(fed, 'kcal'), protein: avg(fed, 'protein'), carbs: avg(fed, 'carbs'), fat: avg(fed, 'fat') },
    proteinHits: tp > 0 ? fed.filter((d) => d.protein >= tp).length : null,
    kcalHits: tk > 0 ? fed.filter((d) => kcalOnTarget(d.kcal, tk)).length : null,
    waterDays: watered.length,
    waterAvg: avg(watered, 'ml'),
    waterHits: waterGoal > 0 ? watered.filter((d) => d.ml >= waterGoal).length : null,
  }
}
