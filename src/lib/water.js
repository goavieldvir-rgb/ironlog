import { supabase } from '../supabase.js'

// Water tracker (nutrition beta). Amounts are whole ml. Every data function
// throws on a Supabase error.

export const QUICK_ML = [250, 500, 750]
export const GOAL_PRESETS = [2000, 2500, 3000, 3500]
export const MAX_DRINK_ML = 5000
export const GOAL_MIN = 500
export const GOAL_MAX = 10000

function check({ data, error }) {
  if (error) throw error
  return data
}

export function sumMl(rows) {
  return rows.reduce((s, r) => s + (Number(r.ml) || 0), 0)
}

// 1250 -> "1.25", 2000 -> "2"
export function litres(ml) {
  return String(Math.round((Number(ml) || 0) / 10) / 100)
}

export async function getWaterLogs(uid, from, to) {
  return check(
    await supabase
      .from('water_logs')
      .select('id, date, ml, created_at')
      .eq('user_id', uid)
      .gte('date', from)
      .lte('date', to)
      .order('created_at', { ascending: true }),
  )
}

export async function addWater(uid, date, ml) {
  return check(await supabase.from('water_logs').insert({ user_id: uid, date, ml }).select().single())
}

export async function deleteWater(ids) {
  if (!ids.length) return
  check(await supabase.from('water_logs').delete().in('id', ids))
}

export async function getWaterGoal(uid) {
  const row = check(await supabase.from('water_goals').select('ml').eq('user_id', uid).maybeSingle())
  return row?.ml ?? null
}

export async function saveWaterGoal(uid, ml) {
  return check(
    await supabase
      .from('water_goals')
      .upsert({ user_id: uid, ml, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      .select('ml')
      .single(),
  ).ml
}
