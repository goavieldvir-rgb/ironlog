// Sends the daily "you have a workout today" web push. Called every 15
// minutes by pg_cron (see supabase-push-reminders.sql). Deploy with
// verify_jwt = false; callers prove themselves with the x-cron-secret header.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

// A reminder is sent at most this long after its set time, so turning it on
// late in the evening doesn't fire an out-of-date "good morning" nudge.
const WINDOW_MIN = 180

function localParts(tz: string) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  })
  const p = Object.fromEntries(f.formatToParts(new Date()).map((x) => [x.type, x.value]))
  const hour = p.hour === '24' ? '00' : p.hour
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday)
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(hour) * 60 + Number(p.minute), dow }
}

const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))

const COPY = {
  en: (names: string) => ({ title: "Today's workout", body: `${names} is on the plan today. Let's go.` }),
  he: (names: string) => ({ title: 'האימון של היום', body: `${names} מחכה לכם היום. בואו נתחיל.` }),
}

Deno.serve(async (req) => {
  const { data: cfgRows } = await db.from('push_config').select('key, value')
  const cfg = Object.fromEntries((cfgRows || []).map((r) => [r.key, r.value]))
  if (!cfg.cron_secret || req.headers.get('x-cron-secret') !== cfg.cron_secret) {
    return new Response('forbidden', { status: 403 })
  }
  webpush.setVapidDetails(cfg.vapid_subject || 'mailto:admin@example.com', cfg.vapid_public, cfg.vapid_private)

  const { data: subs, error } = await db.from('push_subscriptions').select('*')
  if (error) return new Response(error.message, { status: 500 })

  let sent = 0, skipped = 0, removed = 0, failed = 0
  for (const s of subs || []) {
    try {
      const now = localParts(s.tz)
      const due = toMinutes(s.remind_time)
      if (s.last_sent_date === now.date || now.minutes < due || now.minutes >= due + WINDOW_MIN) { skipped++; continue }

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

      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ ...msg, lang: s.lang, tag: 'ironlog-daily' }),
          { TTL: 3600 },
        )
        await db.from('push_subscriptions').update({ last_sent_date: now.date }).eq('id', s.id)
        sent++
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) {
          await db.from('push_subscriptions').delete().eq('id', s.id)
          removed++
        } else throw e
      }
    } catch (e) {
      console.error('reminder failed', s.id, e?.message || e)
      failed++
    }
  }
  return new Response(JSON.stringify({ sent, skipped, removed, failed }), { headers: { 'content-type': 'application/json' } })
})
