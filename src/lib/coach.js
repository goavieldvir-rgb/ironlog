import { supabase } from '../supabase.js'
import { toLocalISODate, weekStartOf } from './dates.js'
import { TERMS_VERSION } from '../legal/terms.js'

// Coach-side data for the People page and a trainee's coach page. The
// roster comes from one database call (coach_roster, supabase-coach-tools.sql)
// instead of downloading every trainee's sessions.

function check({ data, error }) {
  if (error) throw error
  return data
}

export const shiftDay = (iso, n) => {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return toLocalISODate(d)
}

export function daysSince(iso, today = toLocalISODate()) {
  if (!iso) return null
  return Math.round((new Date(today + 'T00:00:00') - new Date(iso + 'T00:00:00')) / 86400000)
}

export async function fetchRoster(today = toLocalISODate()) {
  return check(await supabase.rpc('coach_roster', { p_today: today })) || []
}

// The team's records from the last week, newest first, for the desktop panel.
export async function fetchRecentPrs(today = toLocalISODate()) {
  return check(
    await supabase
      .from('admin_notifications')
      .select('trainee_id, detail, sent_at')
      .eq('type', 'pr')
      .gte('sent_at', shiftDay(today, -6))
      .order('sent_at', { ascending: false })
      .limit(20),
  )
}

// Share of planned sessions done over the last four full weeks (this week is
// still running). week_counts is oldest first, the last one is this week.
export function adherence(weekCounts, planned) {
  if (!planned || !weekCounts?.length) return null
  const done = weekCounts.slice(-5, -1).reduce((a, b) => a + b, 0)
  return Math.min(100, Math.round((done / (planned * 4)) * 100))
}

// Everything worth a coach's attention on one trainee, most urgent first.
// Each flag is a translation key plus its values; score orders the list.
export function rosterFlags(p, today = toLocalISODate()) {
  const flags = []
  const quietDays = daysSince(p.last_session, today)
  const adh = adherence(p.week_counts, p.planned_per_week)
  if (p.last_session && quietDays >= (p.inactivity_alert_days || 5)) {
    flags.push({ key: 'quiet', tone: 'warn', score: 3, n: quietDays })
  }
  if (adh != null && adh < 60 && (p.week_counts || []).slice(0, -1).some((n) => n > 0)) {
    flags.push({ key: 'behind', tone: 'warn', score: 2, n: adh })
  }
  if (p.next_checkin && p.next_checkin <= today) {
    flags.push({ key: 'checkin', tone: 'warn', score: 2, n: daysSince(p.next_checkin, today) })
  }
  if (p.nutrition_enabled && p.kcal_target && (p.food_days_7 || 0) < 3) {
    flags.push({ key: 'food', tone: 'warn', score: 1, n: p.food_days_7 || 0 })
  }
  if (p.to_review > 0) flags.push({ key: 'review', tone: 'accent', score: 1, n: p.to_review })
  if (p.prs_7d > 0) flags.push({ key: 'pr', tone: 'good', score: 0, n: p.prs_7d })
  if (!p.terms_version || p.terms_version < TERMS_VERSION) flags.push({ key: 'terms', tone: 'muted', score: 0 })
  return flags
}

export function attentionScore(flags) {
  return flags.reduce((s, f) => s + (f.tone === 'warn' ? f.score : 0), 0)
}

// ---- One trainee ----

export async function fetchTraineeDetail(uid, today = toLocalISODate()) {
  const since = shiftDay(today, -7 * 26)
  const [profile, sessions, weights, prs, notes, goal, schedule, consent, food, targets] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', uid).single().then(check),
    supabase
      .from('sessions')
      .select('id, date, routine_name, category, trainer_comment, reviewed_at, duration_minutes, created_at')
      .eq('user_id', uid)
      .gte('date', since)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .then(check),
    supabase.from('body_weight_logs').select('date, weight, unit').eq('user_id', uid).order('date', { ascending: true }).then(check),
    supabase
      .from('admin_notifications')
      .select('detail, sent_at')
      .eq('trainee_id', uid)
      .eq('type', 'pr')
      .order('sent_at', { ascending: false })
      .limit(12)
      .then(check),
    supabase.from('coach_notes').select('*').eq('trainee_id', uid).order('created_at', { ascending: false }).then(check),
    supabase.from('coach_goals').select('*').eq('trainee_id', uid).maybeSingle().then(check),
    supabase.from('weekly_schedule').select('day_of_week, routine_id').eq('user_id', uid).then(check),
    supabase
      .from('consents')
      .select('version, variant, accepted_at, guardian_name')
      .eq('user_id', uid)
      .order('accepted_at', { ascending: false })
      .limit(1)
      .then(check),
    supabase
      .from('food_logs')
      .select('date, kcal, protein')
      .eq('user_id', uid)
      .gte('date', shiftDay(today, -7))
      .lt('date', today)
      .then(check),
    supabase.from('nutrition_targets').select('kcal, protein').eq('user_id', uid).maybeSingle().then(check),
  ])
  return { profile, sessions, weights, prs, notes, goal, schedule, consent: consent[0] || null, food, targets }
}

// Sessions per week for the last `n` weeks, oldest first.
export function weeklyCounts(sessions, n, today = toLocalISODate()) {
  const thisWeek = weekStartOf(today)
  const weeks = []
  for (let i = n - 1; i >= 0; i--) weeks.push(shiftDay(thisWeek, -7 * i))
  const counts = Object.fromEntries(weeks.map((w) => [w, 0]))
  for (const s of sessions) {
    const w = weekStartOf(s.date)
    if (w in counts) counts[w] += 1
  }
  return weeks.map((w) => ({ week: w, count: counts[w] }))
}

// Not yet opened or commented on by the coach, from the last two weeks.
export function needsReview(s, today = toLocalISODate()) {
  return !s.reviewed_at && !s.trainer_comment && s.date >= shiftDay(today, -14)
}

export async function markSessionsReviewed(uid, ids) {
  if (!ids.length) return
  check(await supabase.from('sessions').update({ reviewed_at: new Date().toISOString() }).eq('user_id', uid).in('id', ids))
}

export async function addCoachNote(traineeId, body) {
  return check(await supabase.from('coach_notes').insert({ trainee_id: traineeId, body }).select().single())
}

export async function setCoachNotePinned(id, pinned) {
  check(await supabase.from('coach_notes').update({ pinned }).eq('id', id))
}

export async function deleteCoachNote(id) {
  check(await supabase.from('coach_notes').delete().eq('id', id))
}

export async function saveCoachGoal(traineeId, patch) {
  return check(
    await supabase
      .from('coach_goals')
      .upsert({ trainee_id: traineeId, ...patch, updated_at: new Date().toISOString() })
      .select()
      .single(),
  )
}
