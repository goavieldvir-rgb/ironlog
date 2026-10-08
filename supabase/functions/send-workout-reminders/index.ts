// Sends the daily "you have a workout today" web push, and the on-demand
// "send a test notification" from the Notifications page.
//
// Two ways in (deploy with verify_jwt = false, the function checks itself):
//  - pg_cron, every 15 minutes: header x-cron-secret must match push_config.
//  - the app's test button: the signed-in user's own token; sends only to
//    that user's own subscriptions, at most once a minute.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { isAllowedEndpoint, isDue, localParts } from './helpers.ts'

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
const TEST_COPY = {
  en: { title: 'Ironlog', body: 'Test notification. Reminders are working.' },
  he: { title: 'Ironlog', body: 'התראת בדיקה. התזכורות עובדות.' },
}

// Returns 'sent' | 'removed' (expired on the phone's side). Throws otherwise.
async function deliver(s: any, msg: { title: string; body: string }, tag: string) {
  if (!isAllowedEndpoint(s.endpoint)) {
    await db.from('push_subscriptions').delete().eq('id', s.id)
    return 'removed'
  }
  try {
    await webpush.sendNotification(
      { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
      JSON.stringify({ ...msg, lang: s.lang, tag }),
      { TTL: 3600 },
    )
    return 'sent'
  } catch (e) {
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
    } catch (e) {
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
      if (s.last_sent_date === now.date || !isDue(s.remind_time, now.minutes)) { skipped++; continue }

      const { data: sched } = await db.from('weekly_schedule').select('routine_id')
        .eq('user_id', s.user_id).eq('day_of_week', now.dow).not('routine_id', 'is', null)
      const ids = [...new Set((sched || []).map((r) => r.routine_id))]
      if (!ids.length) { skipped++; continue }

      // Already trained as much as was planned today? Then no nudge.
      const { count } = await db.from('sessions').select('id', { count: 'exact', head: true })
        .eq('user_id', s.user_id).eq('date', now.date)
      if ((count || 0) >= ids.length) { skipped++; continue }

      const { data: routines } = await db.from('routines').select('name').in('id', ids)
      const names = (routines || []).map((r) => r.name).join(' + ') || 'Workout'
      const msg = (COPY[s.lang as 'en' | 'he'] || COPY.en)(names)

      if ((await deliver(s, msg, 'ironlog-daily')) === 'sent') {
        await db.from('push_subscriptions').update({ last_sent_date: now.date }).eq('id', s.id)
        sent++
      } else removed++
    } catch (e) {
      console.error('reminder failed', s.id, e?.message || e)
      failed++
    }
  }
  return json({ sent, skipped, removed, failed })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)

  const { data: cfgRows } = await db.from('push_config').select('key, value')
  const cfg = Object.fromEntries((cfgRows || []).map((r) => [r.key, r.value]))
  webpush.setVapidDetails(cfg.vapid_subject, cfg.vapid_public, cfg.vapid_private)

  const secret = req.headers.get('x-cron-secret')
  if (secret) return secret === cfg.cron_secret ? runReminders() : json({ error: 'forbidden' }, 403)
  return runTest(req)
})
