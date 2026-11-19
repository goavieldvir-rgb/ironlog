import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import { toLocalISODate, weekStartOf } from './dates.js'
import { TERMS_VERSION, TERMS_DOC_KEY } from '../legal/terms.js'
import { fetchMeasurements, fetchMeasurementSetup } from './measurements.js'
import { fetchAnswers } from './checkins.js'

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
  const rows = check(await supabase.rpc('coach_roster', { p_today: today })) || []
  // Who has been removed from the app (only people this coach may see come
  // back). Before the SQL is run the column doesn't exist: nobody is removed.
  const { data, error } = await supabase.from('profiles').select('id').not('removed_at', 'is', null)
  if (error) return rows
  const removed = new Set((data || []).map((r) => r.id))
  return rows.map((r) => ({ ...r, removed: removed.has(r.id) }))
}

// A coach's own trainee count and limit (null when there is no limit).
export async function fetchMyCoachLimit() {
  const { data, error } = await supabase.rpc('my_coach_limit')
  if (error) return null
  return data?.[0] || null
}

// The team's records from the last week, newest first, for the desktop panel.
export async function fetchRecentPrs(today = toLocalISODate()) {
  return check(
    await supabase
      .from('admin_notifications')
      .select('trainee_id, detail, sent_at')
      .eq('type', 'pr')
      .gte('sent_at', new Date(shiftDay(today, -6) + 'T00:00:00').toISOString())
      .order('sent_at', { ascending: false })
      .limit(20),
  )
}

// Share of planned sessions done over the last four full weeks (this week is
// still running). week_counts is oldest first, the last one is this week.
// Weeks before the account existed don't count against anyone, so a trainee
// who joined two weeks ago is measured on those two weeks only.
export function adherence(weekCounts, planned, createdAt, today = toLocalISODate()) {
  if (!planned || !weekCounts?.length) return null
  let weeks = 4
  if (createdAt) {
    const joinedWeek = weekStartOf(toLocalISODate(new Date(createdAt)))
    const thisWeek = weekStartOf(today)
    // Full weeks between the week they joined (counted only if they joined on
    // its first day) and this week.
    const full = Math.round((new Date(thisWeek + 'T00:00:00') - new Date(joinedWeek + 'T00:00:00')) / (7 * 86400000))
    const joinedMidWeek = toLocalISODate(new Date(createdAt)) > joinedWeek
    weeks = Math.min(4, full - (joinedMidWeek ? 1 : 0))
  }
  if (weeks <= 0) return null
  const done = weekCounts.slice(-1 - weeks, -1).reduce((a, b) => a + b, 0)
  return Math.min(100, Math.round((done / (planned * weeks)) * 100))
}

// Everything worth a coach's attention on one trainee, most urgent first.
// Each flag is a translation key plus its values; score orders the list.
export function rosterFlags(p, today = toLocalISODate(), behindPct = 60, tasksOff = []) {
  const flags = []
  const quietDays = daysSince(p.last_session, today)
  const adh = adherence(p.week_counts, p.planned_per_week, p.created_at, today)
  if (p.last_session && quietDays >= (p.inactivity_alert_days || 5)) {
    flags.push({ key: 'quiet', tone: 'warn', score: 3, n: quietDays })
  }
  // Signed up and never trained: the trainee who most needs a nudge, and the
  // one the other flags (they all need a first session) can't see.
  if (!p.last_session && p.created_at) {
    const age = daysSince(toLocalISODate(new Date(p.created_at)), today)
    if (age > 3) flags.push({ key: 'never', tone: 'warn', score: 2, n: age })
  }
  if (adh != null && adh < behindPct && (p.week_counts || []).slice(0, -1).some((n) => n > 0)) {
    flags.push({ key: 'behind', tone: 'warn', score: 2, n: adh })
  }
  if (p.next_checkin && p.next_checkin <= today && !tasksOff.includes('checkin')) {
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

// ---- Coach tasks (supabase-coach-tasks.sql) ----

// Adds today's tasks first (the morning job does the same), then loads every
// open task plus what was done in the last week, so ticking one off can be undone.
export async function fetchCoachTasks(today = toLocalISODate()) {
  check(await supabase.rpc('refresh_coach_tasks', { p_today: today }))
  const since = new Date(shiftDay(today, -7) + 'T00:00:00').toISOString()
  return check(
    await supabase
      .from('coach_tasks')
      .select('id, trainee_id, kind, title, n, due, done_at, auto_done, created_at')
      .or(`done_at.is.null,done_at.gte.${since}`)
      .order('due', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(200),
  )
}

export async function setCoachTaskDone(id, done) {
  return check(
    await supabase
      .from('coach_tasks')
      .update({ done_at: done ? new Date().toISOString() : null, auto_done: false })
      .eq('id', id)
      .select('id, trainee_id, kind, title, n, due, done_at, auto_done, created_at')
      .single(),
  )
}

export async function addCoachTask(title, traineeId = null, due = toLocalISODate()) {
  return check(
    await supabase
      .from('coach_tasks')
      // Hand-written tasks are never pushed: the coach just wrote them.
      .insert({ kind: 'custom', title, trainee_id: traineeId, due, notified_at: new Date().toISOString() })
      .select('id, trainee_id, kind, title, n, due, done_at, auto_done, created_at')
      .single(),
  )
}

export async function deleteCoachTask(id) {
  check(await supabase.from('coach_tasks').delete().eq('id', id))
}

// ---- One trainee ----

export async function fetchTraineeDetail(uid, today = toLocalISODate()) {
  const since = shiftDay(today, -7 * 26)
  const [profile, sessions, weights, measurements, prs, notes, goal, schedule, consent, food, targets, routines, exercises, measurementSetup, traineeSettings, checkins, coachMeals] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', uid).single().then(check),
    supabase
      .from('sessions')
      .select('id, date, routine_id, routine_name, category, trainer_comment, reviewed_at, duration_minutes, created_at')
      .eq('user_id', uid)
      .gte('date', since)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .then(check),
    supabase
      .from('body_weight_logs')
      .select('date, weight, unit')
      .eq('user_id', uid)
      .order('date', { ascending: true })
      .order('created_at', { ascending: true })
      .then(check),
    fetchMeasurements(uid),
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
    supabase.from('weekly_schedule').select('day_of_week, slot, routine_id').eq('user_id', uid).then(check),
    supabase
      .from('consents')
      .select('version, variant, accepted_at, guardian_name')
      .eq('user_id', uid)
      .eq('doc_key', TERMS_DOC_KEY)
      .order('version', { ascending: false })
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
    supabase.from('routines').select('id, name, category, exercises').eq('user_id', uid).order('created_at', { ascending: false }).then(check),
    // The trainee's own library, so their routines show the same clip and
    // name here as on their phone (a clip picked for a Hebrew-named
    // exercise, a renamed exercise). Optional: the routines still list
    // without it.
    supabase
      .from('exercises')
      .select('id, name, name_he, clip, video_url')
      .eq('user_id', uid)
      .then(({ data, error }) => (error ? [] : data || []), () => []),
    fetchMeasurementSetup(uid),
    // Optional: null until supabase-coach-extras.sql has been run.
    supabase.from('trainee_settings').select('*').eq('user_id', uid).maybeSingle().then(({ data, error }) => (error ? null : data || {}), () => null),
    fetchAnswers(uid).catch(() => null),
    // Optional: the coach's meal options and how many planned meals were
    // logged in the last 7 days. Null before the coach meal options migration.
    Promise.all([
      supabase.from('saved_meals').select('id', { count: 'exact', head: true }).eq('user_id', uid).eq('by_coach', true),
      supabase.from('food_logs').select('date, meal').eq('user_id', uid).not('saved_meal_id', 'is', null).gte('date', shiftDay(today, -7)).lt('date', today),
    ]).then(
      ([opts, logs]) => (opts.error || logs.error ? null : { options: opts.count || 0, eaten: new Set((logs.data || []).map((r) => `${r.date}|${r.meal}`)).size }),
      () => null,
    ),
  ])
  // The birthday lives on the person (it moves with them), the rest of the
  // goal is this coach's own.
  const withBirthday = goal || profile?.birthday ? { ...(goal || {}), birthday: profile?.birthday ?? null } : null
  return { profile, sessions, weights, measurements, measurementSetup, traineeSettings, checkins, prs, notes, goal: withBirthday, schedule, consent: consent[0] || null, food, targets, routines, exercises, coachMeals }
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
  const { birthday, ...rest } = patch
  if (birthday !== undefined) check(await supabase.from('profiles').update({ birthday }).eq('id', traineeId))
  const row = check(
    await supabase
      .from('coach_goals')
      .upsert({ trainee_id: traineeId, ...rest, updated_at: new Date().toISOString() })
      .select()
      .single(),
  )
  return birthday !== undefined ? { ...row, birthday } : row
}

// Sign-up is by invitation: an email can create an account for 30 days
// after the coach copies its invite (see supabase-security-round3.sql).
// Copying again renews it.
// Another coach's live invite for the same email gives INVITED_BY_OTHER_COACH.
export async function recordInvite(email) {
  check(await supabase.rpc('record_invite', { p_email: email.trim().toLowerCase() }))
}

// The owner's display name for coach screens, read from the database (not
// built into the app). Asked once per session.
let ownerNamePromise = null
export function fetchOwnerName() {
  if (!ownerNamePromise) {
    ownerNamePromise = supabase.rpc('app_owner_name').then(({ data, error }) => {
      if (error) {
        ownerNamePromise = null
        throw error
      }
      return data || ''
    })
  }
  return ownerNamePromise
}

export function useOwnerName(enabled = true) {
  const [name, setName] = useState('')
  useEffect(() => {
    if (!enabled) return
    let live = true
    fetchOwnerName().then((n) => live && setName(n), (e) => console.error(e))
    return () => { live = false }
  }, [enabled])
  return name
}
