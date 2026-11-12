// Sends the daily "you have a workout today" web push, the "your coach left
// feedback" push, the coach's morning "needs attention" push, the "rest is
// over" push for a rest timer running in the background, and the
// on-demand "send a test notification" from the Notifications page, and
// the "new message" push to the other side of a coach message thread.
//
// Two ways in (deploy with verify_jwt = false, the function checks itself):
//  - the database, with header x-cron-secret matching push_config: pg_cron
//    every 15 minutes for reminders, or the trainer feedback trigger
//    (supabase-coach-feedback.sql) with { feedback_session_id }, or the
//    morning coach tasks job (supabase-coach-tasks.sql) with { coach_tasks },
//    or the rest timer job (supabase-rest-timer-push.sql) with { rest_alerts },
//    or the new message trigger (supabase-message-push.sql) with { message_id }.
//  - the app's test button: the signed-in user's own token; sends only to
//    that user's own subscriptions, at most once a minute.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { coachTasksCopy, feedbackCopy, messageCopy, isAllowedEndpoint, isDue, localParts, reminderKind } from './helpers.ts'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const TEST_COOLDOWN_MS = 60_000

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } })

const COPY = {
  en: (names: string) => ({ title: "Today's workout", body: `${names} is on the plan today. Let's go.` }),
  he: (names: string) => ({ title: 'האימון של היום', body: `${names} מחכה לכם היום. בואו נתחיל.` }),
}
const REST_COPY = {
  en: { title: 'Rest day', body: 'Recovery is key. Rest well today.' },
  he: { title: 'יום מנוחה', body: 'התאוששות היא המפתח. נוחו היטב היום.' },
}
const TEST_COPY = {
  en: { title: 'Ironlog', body: 'Test notification. Reminders are working.' },
  he: { title: 'Ironlog', body: 'התראת בדיקה. התזכורות עובדות.' },
}

const REST_DONE_COPY = {
  en: { title: 'Rest over', body: 'Time for your next set.' },
  he: { title: 'המנוחה נגמרה', body: 'זמן לסט הבא.' },
}
// A rest alert that comes much later than the rest itself (the job was down,
// say) is no use mid-workout, so it is dropped instead of sent.
const REST_STALE_MS = 120_000

// Returns 'sent' | 'removed' (expired on the phone's side). Throws otherwise.
async function deliver(s: any, msg: { title: string; body: string; url?: string; count?: number }, tag: string, ttl = 3600) {
  if (!isAllowedEndpoint(s.endpoint)) {
    await db.from('push_subscriptions').delete().eq('id', s.id)
    return 'removed'
  }
  try {
    await webpush.sendNotification(
      { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
      JSON.stringify({ ...msg, lang: s.lang, tag }),
      { TTL: ttl },
    )
    return 'sent'
  } catch (e: any) {
    if (e.statusCode === 404 || e.statusCode === 410) {
      await db.from('push_subscriptions').delete().eq('id', s.id)
      return 'removed'
    }
    throw e
  }
}

async function runTest(req: Request) {
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer /i, '')
  const { data: u } = await db.auth.getUser(jwt)
  if (!u?.user) return json({ error: 'not signed in' }, 401)

  const { data: subs } = await db.from('push_subscriptions').select('*').eq('user_id', u.user.id)
  if (!subs?.length) return json({ error: 'no subscription' }, 404)
  const recent = subs.some((s) => s.last_test_at && Date.now() - new Date(s.last_test_at).getTime() < TEST_COOLDOWN_MS)
  if (recent) return json({ error: 'too soon' }, 429)

  let sent = 0
  for (const s of subs) {
    await db.from('push_subscriptions').update({ last_test_at: new Date().toISOString() }).eq('id', s.id)
    try {
      if ((await deliver(s, TEST_COPY[s.lang as 'en' | 'he'] || TEST_COPY.en, 'ironlog-test')) === 'sent') sent++
    } catch (e: any) {
      console.error('test push failed', s.id, e?.message || e)
    }
  }
  return json({ sent })
}

async function runReminders() {
  const { data: subs, error } = await db.from('push_subscriptions').select('*')
  if (error) return json({ error: error.message }, 500)

  let sent = 0, skipped = 0, removed = 0, failed = 0
  for (const s of subs || []) {
    try {
      const now = localParts(s.tz)
      // Chosen weekdays, read in the phone's own tz. Null/missing (column not
      // added yet) or an empty list means every day.
      if (Array.isArray(s.remind_days) && s.remind_days.length && !s.remind_days.includes(now.dow)) { skipped++; continue }
      if (s.last_sent_date === now.date || !isDue(s.remind_time, now.minutes)) { skipped++; continue }

      const { data: sched } = await db.from('weekly_schedule').select('day_of_week, routine_id')
        .eq('user_id', s.user_id).not('routine_id', 'is', null)
      const planned = sched || []
      const ids = [...new Set(planned.filter((r) => r.day_of_week === now.dow).map((r) => r.routine_id))]

      const { count } = await db.from('sessions').select('id', { count: 'exact', head: true })
        .eq('user_id', s.user_id).eq('date', now.date)
      const kind = reminderKind(ids.length, planned.length, count || 0)
      if (!kind) { skipped++; continue }

      let msg
      if (kind === 'rest') {
        msg = REST_COPY[s.lang as 'en' | 'he'] || REST_COPY.en
      } else {
        const { data: routines } = await db.from('routines').select('name').in('id', ids)
        const names = (routines || []).map((r) => r.name).join(' + ') || 'Workout'
        msg = (COPY[s.lang as 'en' | 'he'] || COPY.en)(names)
      }

      if ((await deliver(s, msg, 'ironlog-daily')) === 'sent') {
        await db.from('push_subscriptions').update({ last_sent_date: now.date }).eq('id', s.id)
        sent++
      } else removed++
    } catch (e: any) {
      console.error('reminder failed', s.id, e?.message || e)
      failed++
    }
  }
  return json({ sent, skipped, removed, failed })
}

async function runFeedback(sessionId: string) {
  const { data: session } = await db.from('sessions')
    .select('id, user_id, routine_name, trainer_comment').eq('id', sessionId).maybeSingle()
  if (!session?.trainer_comment?.trim()) return json({ error: 'no feedback' }, 404)

  const { data: subs } = await db.from('push_subscriptions').select('*').eq('user_id', session.user_id)
  let sent = 0, removed = 0, failed = 0
  for (const s of subs || []) {
    try {
      const msg = feedbackCopy(s.lang, session.routine_name, session.trainer_comment)
      // A day to arrive: feedback still matters if the phone was off overnight.
      const r = await deliver(s, { ...msg, url: `#/history/${session.id}` }, `ironlog-feedback-${session.id}`, 86400)
      if (r === 'sent') sent++
      else removed++
    } catch (e: any) {
      console.error('feedback push failed', s.id, e?.message || e)
      failed++
    }
  }
  return json({ sent, removed, failed })
}

// Rests whose end time has passed. Claiming clears them in the database, so
// each is sent once and a rest the app already skipped is never sent.
async function runRestAlerts() {
  const { data: due, error } = await db.rpc('claim_due_rest_alerts')
  if (error) return json({ error: error.message }, 500)
  let sent = 0, stale = 0, removed = 0, failed = 0
  for (const s of due || []) {
    if (Date.now() - new Date(s.ends_at).getTime() > REST_STALE_MS) { stale++; continue }
    try {
      // Same tag as the app's own alert, so the two never stack up.
      const r = await deliver(s, REST_DONE_COPY[s.lang as 'en' | 'he'] || REST_DONE_COPY.en, 'ironlog-rest-timer', 60)
      if (r === 'sent') sent++
      else removed++
    } catch (e: any) {
      console.error('rest push failed', s.id, e?.message || e)
      failed++
    }
  }
  return json({ sent, stale, removed, failed })
}

// Each coach gets the new open tasks for their own trainees on their own
// devices (the owner also gets tasks for anyone without a coach, and their
// own hand-written ones). Once a coach's push lands, those tasks are marked
// as sent so tomorrow's push only has the new ones. ntfy is the owner's
// phone only, so it is the fallback for the owner's tasks alone.
async function runCoachTasks() {
  const { data: tasks, error } = await db.from('coach_tasks')
    .select('id, kind, n, title, trainee_id, coach_id').is('done_at', null).is('notified_at', null).order('created_at')
  if (error) return json({ error: error.message }, 500)
  if (!tasks?.length) return json({ sent: 0 })

  const ids = [...new Set(tasks.map((t) => t.trainee_id).filter(Boolean))]
  const { data: people } = ids.length ? await db.from('profiles').select('id, full_name, email, coach_id').in('id', ids) : { data: [] }
  const byId = Object.fromEntries((people || []).map((p) => [p.id, p]))
  const nameOf = (id: string | null) => (id ? byId[id]?.full_name || byId[id]?.email?.split('@')[0] || '' : '')

  const { data: coachRows } = await db.from('profiles').select('id, is_admin').or('is_admin.eq.true,is_coach.eq.true')
  const ownerIds = new Set((coachRows || []).filter((c) => c.is_admin).map((c) => c.id))
  const coachIds = new Set((coachRows || []).map((c) => c.id))
  const ownerId = [...ownerIds][0] || null
  // Whose task is it: the trainee's coach, else whoever wrote it, else the
  // owner. Someone who is no longer a coach never gets it.
  const coachOf = (t: any) => {
    const c = t.trainee_id ? byId[t.trainee_id]?.coach_id : t.coach_id
    return c && coachIds.has(c) ? c : ownerId
  }
  const groups = new Map<string, any[]>()
  for (const t of tasks) {
    const c = coachOf(t)
    if (!c) continue
    groups.set(c, [...(groups.get(c) || []), t])
  }

  let sent = 0, removed = 0, failed = 0, ntfy = false
  const delivered: string[] = []
  for (const [coachId, list] of groups) {
    const items = list.map((t) => ({ kind: t.kind, n: t.n, title: t.title, name: nameOf(t.trainee_id) }))
    const { data: subs } = await db.from('push_subscriptions').select('*').eq('user_id', coachId)
    let got = 0
    for (const s of subs || []) {
      try {
        const r = await deliver(s, { ...coachTasksCopy(s.lang, items), url: '#/people' }, 'ironlog-coach-tasks', 43200)
        if (r === 'sent') { sent++; got++ }
        else removed++
      } catch (e: any) {
        console.error('coach tasks push failed', s.id, e?.message || e)
        failed++
      }
    }
    // No phone of the owner took it (subscription expired, or push failed): ntfy instead.
    if (!got && ownerIds.has(coachId)) {
      const msg = coachTasksCopy('he', items)
      if (!(await db.rpc('send_admin_push', { p_title: msg.title, p_message: msg.body })).error) { got = 1; ntfy = true }
    }
    if (got) delivered.push(...list.map((t) => t.id))
  }
  if (delivered.length) await db.from('coach_tasks').update({ notified_at: new Date().toISOString() }).in('id', delivered)
  return json({ sent, removed, failed, ntfy })
}

// A new message goes to the other side of its thread: the trainee's devices
// when the coach wrote, the trainee's own coach's devices when the trainee
// wrote (the owner's when they have no coach). One tag
// per thread, so a phone shows one card per conversation. The unread count
// also sets the app icon's badge where the phone supports it.
async function runMessage(messageId: string) {
  const { data: m } = await db.from('coach_messages')
    .select('id, trainee_id, sender_id, body, read_at').eq('id', messageId).maybeSingle()
  if (!m) return json({ error: 'no message' }, 404)
  if (m.read_at) return json({ sent: 0, read: true })

  const toCoach = m.sender_id === m.trainee_id
  let recipients: string[]
  let coachId: string | null = null
  let ownerIsCoach = false
  if (toCoach) {
    const { data: t } = await db.from('profiles').select('coach_id').eq('id', m.trainee_id).maybeSingle()
    const { data: coachRows } = await db.from('profiles').select('id, is_admin').or('is_admin.eq.true,is_coach.eq.true')
    const isCoach = (id: string | null | undefined) => !!id && (coachRows || []).some((c) => c.id === id)
    // The trainee's coach while they are still a coach, otherwise the owner.
    coachId = isCoach(t?.coach_id) ? t!.coach_id : (coachRows || []).find((c) => c.is_admin)?.id || null
    ownerIsCoach = !!coachId && (coachRows || []).some((c) => c.id === coachId && c.is_admin)
    // A coach writing in their own thread needs no alert.
    recipients = coachId && coachId !== m.sender_id ? [coachId] : []
  } else {
    recipients = [m.trainee_id]
  }
  if (!recipients.length) return json({ sent: 0 })

  let name = ''
  if (toCoach) {
    const { data: p } = await db.from('profiles').select('full_name, email').eq('id', m.trainee_id).maybeSingle()
    name = p?.full_name || p?.email?.split('@')[0] || ''
  }

  // Unread in this thread, and in total for the app icon badge.
  const unreadQ = () => db.from('coach_messages').select('id', { count: 'exact', head: true }).is('read_at', null)
  const { count: inThread } = toCoach
    ? await unreadQ().eq('trainee_id', m.trainee_id).eq('sender_id', m.trainee_id)
    : await unreadQ().eq('trainee_id', m.trainee_id).neq('sender_id', m.trainee_id)
  let total = inThread || 0
  if (toCoach && coachId) {
    // Badge: unread messages from this coach's own trainees only (the owner
    // also counts people without a coach).
    const { data: mine } = ownerIsCoach
      ? await db.from('profiles').select('id').or(`coach_id.eq.${coachId},coach_id.is.null`)
      : await db.from('profiles').select('id').eq('coach_id', coachId)
    const ids = new Set((mine || []).map((p) => p.id))
    const { data: rows } = await db.from('coach_messages').select('trainee_id, sender_id').is('read_at', null).limit(1000)
    total = (rows || []).filter((r) => r.sender_id === r.trainee_id && ids.has(r.trainee_id)).length
  }

  const { data: subs } = await db.from('push_subscriptions').select('*').in('user_id', recipients)
  const url = toCoach ? `#/people/${m.trainee_id}` : '#/messages'
  let sent = 0, removed = 0, failed = 0
  for (const s of subs || []) {
    try {
      const msg = messageCopy(s.lang, { toCoach, name, text: m.body, unread: inThread || 1 })
      const r = await deliver(s, { ...msg, url, count: total }, `ironlog-msg-${m.trainee_id}`, 86400)
      if (r === 'sent') sent++
      else removed++
    } catch (e: any) {
      console.error('message push failed', s.id, e?.message || e)
      failed++
    }
  }
  // No phone of the owner took it: ntfy (the owner's phone) instead, with
  // the name only. The message text stays inside the app.
  let ntfy = false
  if (toCoach && !sent && ownerIsCoach) {
    const msg = messageCopy('he', { toCoach, name, text: '', unread: inThread || 1 })
    ntfy = !(await db.rpc('send_admin_push', { p_title: 'Ironlog: ' + msg.title, p_message: 'פתחו את Ironlog כדי לקרוא ולענות.' })).error
  }
  return json({ sent, removed, failed, ntfy })
}

// A record by an independent coach's trainee goes to that coach's devices
// (the owner's trainees are announced by email and ntfy in the database).
const PR_COPY = {
  en: (name: string, detail: string) => ({ title: `🏆 New PR: ${name}`, body: detail }),
  he: (name: string, detail: string) => ({ title: `🏆 שיא חדש: ${name}`, body: detail }),
}
async function runPrAlert(traineeId: string, detail: string) {
  const { data: t } = await db.from('profiles').select('full_name, email, coach_id').eq('id', traineeId).maybeSingle()
  if (!t?.coach_id) return json({ sent: 0 })
  const { data: c } = await db.from('profiles').select('id, is_coach, is_admin').eq('id', t.coach_id).maybeSingle()
  if (!c?.is_coach || c.is_admin) return json({ sent: 0 })
  const name = t.full_name || t.email?.split('@')[0] || ''
  const { data: subs } = await db.from('push_subscriptions').select('*').eq('user_id', c.id)
  let sent = 0, removed = 0, failed = 0
  for (const s of subs || []) {
    try {
      const msg = (PR_COPY[s.lang as 'en' | 'he'] || PR_COPY.en)(name, detail)
      const r = await deliver(s, { ...msg, url: `#/people/${traineeId}` }, `ironlog-pr-${traineeId}`, 86400)
      if (r === 'sent') sent++
      else removed++
    } catch (e: any) {
      console.error('pr push failed', s.id, e?.message || e)
      failed++
    }
  }
  return json({ sent, removed, failed })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)

  const { data: cfgRows } = await db.from('push_config').select('key, value')
  const cfg = Object.fromEntries((cfgRows || []).map((r) => [r.key, r.value]))
  webpush.setVapidDetails(cfg.vapid_subject, cfg.vapid_public, cfg.vapid_private)

  const secret = req.headers.get('x-cron-secret')
  if (secret) {
    if (secret !== cfg.cron_secret) return json({ error: 'forbidden' }, 403)
    const body = await req.json().catch(() => ({}))
    if (body?.coach_tasks) return runCoachTasks()
    if (body?.rest_alerts) return runRestAlerts()
    if (body?.message_id) return runMessage(String(body.message_id))
    if (body?.pr_trainee_id) return runPrAlert(String(body.pr_trainee_id), String(body.pr_detail || ''))
    return body?.feedback_session_id ? runFeedback(String(body.feedback_session_id)) : runReminders()
  }
  return runTest(req)
})
