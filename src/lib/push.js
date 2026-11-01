import { supabase } from '../supabase.js'

// Public half of the VAPID key pair — safe to ship. The private half lives
// only in the database's locked config table, never in the repo.
const VAPID_PUBLIC_KEY = 'BCpY9Nphil6kkD3ds5SbmLl4tokahz4EOz0DCrT0-gCWfsiKMUNmbl1jKm_CLVQ_3D56UoIU2Jfjje60lhp5u24'

export const DEFAULT_REMIND_TIME = '08:00'
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]

// False once a request shows push_subscriptions has no remind_days column
// (supabase-reminder-days.sql not run yet): the day picker hides and saves go
// without it.
let daysSupported = true
export const remindDaysSupported = () => daysSupported
const missingDaysColumn = (e) => !!e && (e.code === '42703' || e.code === 'PGRST204' || /remind_days/.test(e.message || ''))

export function isIOS() {
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true
}

// 'ready' | 'needs-install' (iPhone, not on Home Screen) | 'unsupported' | 'denied'
export function pushStatus() {
  if (isIOS() && !isStandalone()) return 'needs-install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  return 'ready'
}

function urlBase64ToUint8Array(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

async function registration() {
  // import.meta.env.BASE_URL is './' (vite base), so this resolves under the
  // GitHub Pages sub-path and the worker's scope is the app folder.
  const url = new URL(import.meta.env.BASE_URL + 'sw.js', window.location.href)
  const reg = await navigator.serviceWorker.register(url.href, { scope: new URL('./', url).href })
  await navigator.serviceWorker.ready
  return reg
}

export function currentTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

// This device's saved reminder row (or null). Throws if the lookup fails.
export async function getMyReminder(uid) {
  if (pushStatus() !== 'ready' || Notification.permission !== 'granted') return null
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return null
  const find = (cols) => supabase.from('push_subscriptions').select(cols).eq('user_id', uid).eq('endpoint', sub.endpoint).maybeSingle()
  const withDays = daysSupported
  let { data, error } = await find(withDays ? 'remind_time, tz, remind_days' : 'remind_time, tz')
  if (error && withDays && missingDaysColumn(error)) {
    daysSupported = false
    ;({ data, error } = await find('remind_time, tz'))
  }
  // A failed lookup must not look like "reminders off" — the caller shows a retry.
  if (error) throw error
  return data || null
}

// Weekdays (0 = Sunday) that have a routine in the weekly plan.
export async function getTrainingDays(uid) {
  const { data, error } = await supabase.from('weekly_schedule').select('day_of_week').eq('user_id', uid).not('routine_id', 'is', null)
  if (error) throw error
  return [...new Set((data || []).map((r) => r.day_of_week))].filter((d) => d >= 0 && d <= 6).sort()
}

// Must be called from a tap (iOS requires it for the permission prompt).
export async function enableReminder(uid, remindTime, lang, days) {
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('denied')
  const reg = await registration()
  const sub =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) }))
  if (!isSupportedService(sub.endpoint)) {
    await sub.unsubscribe()
    throw new Error('unsupported-service')
  }
  await saveReminder(uid, sub, remindTime, lang, days)
}

// Same list the server accepts (see the function and the table's check).
function isSupportedService(endpoint) {
  try {
    const u = new URL(endpoint)
    const h = u.hostname
    return u.protocol === 'https:' && (h === 'fcm.googleapis.com' || h === 'updates.push.services.mozilla.com' || h === 'web.push.apple.com' || h.endsWith('.notify.windows.com'))
  } catch {
    return false
  }
}

async function saveReminder(uid, sub, remindTime, lang, days) {
  const j = sub.toJSON()
  const row = {
    user_id: uid,
    endpoint: j.endpoint,
    p256dh: j.keys.p256dh,
    auth: j.keys.auth,
    remind_time: remindTime,
    tz: currentTimeZone(),
    lang,
    updated_at: new Date().toISOString(),
  }
  const put = (r) => supabase.from('push_subscriptions').upsert(r, { onConflict: 'user_id,endpoint' })
  let error
  if (daysSupported && days) {
    ;({ error } = await put({ ...row, remind_days: days }))
    // Column missing: save the rest without it, quietly.
    if (missingDaysColumn(error)) { daysSupported = false; ;({ error } = await put(row)) }
  } else {
    ;({ error } = await put(row))
  }
  if (error) throw error
}

export async function updateReminder(uid, remindTime, lang, days) {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) throw new Error('no-subscription')
  await saveReminder(uid, sub, remindTime, lang, days)
}

export async function disableReminder(uid) {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('user_id', uid).eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

// Asks the server to push a test notification to this person's own devices.
// Returns 'sent' | 'too-soon' | 'failed'.
export async function sendTestNotification() {
  const { data, error } = await supabase.functions.invoke('send-workout-reminders', { body: { test: true } })
  if (error) {
    return error.context?.status === 429 ? 'too-soon' : 'failed'
  }
  return data?.sent > 0 ? 'sent' : 'failed'
}

// Signing out removes this phone's reminder, so the next person who signs in
// here doesn't get the previous person's workout notifications.
export async function removeDeviceReminder(uid) {
  try {
    if (!('serviceWorker' in navigator)) return
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (!sub) return
    await supabase.from('push_subscriptions').delete().eq('user_id', uid).eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  } catch (e) {
    console.error(e)
  }
}

// Puts the rest timer's end time on this phone's push subscription, so the
// server sends "rest over" even while the app is in the background (iPhone
// pauses the app, so it can't alert by itself). null cancels it. Calls run
// one after another, so a quick burst of +15 taps ends on the last value.
// Does nothing on a phone without a push subscription.
let restQueue = Promise.resolve()
export function setRestPush(endsAt) {
  restQueue = restQueue.then(async () => {
    try {
      if (!('serviceWorker' in navigator)) return
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      if (!sub) return
      const { error } = await supabase
        .from('push_subscriptions')
        .update({ rest_ends_at: endsAt ? new Date(endsAt).toISOString() : null })
        .eq('endpoint', sub.endpoint)
      if (error) console.error(error)
    } catch (e) {
      console.error(e)
    }
  })
  return restQueue
}

// The app's service worker, registered on first use. Notifications shown from
// the page must go through it: Android only allows those, and iPhone only
// shows them for a Home Screen app.
let swPromise = null
export function swRegistration() {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null)
  if (!swPromise) {
    swPromise = navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg || registration())
      .catch((e) => {
        swPromise = null
        console.error(e)
        return null
      })
  }
  return swPromise
}

// The rest timer's notification on the lock screen and in the notification
// shade. Same tag as the server's "rest over" push, so there is only ever one
// and the push replaces it. Calls run one after another, so a clear that
// follows a show is never overtaken by it.
const REST_TAG = 'ironlog-rest-timer'
let lockQueue = Promise.resolve()
export function showRestNotification({ title, body, endsAt, alert = false, lang }) {
  lockQueue = lockQueue.then(async () => {
    try {
      const reg = await swRegistration()
      if (!reg || Notification.permission !== 'granted') return
      await reg.showNotification(title, {
        body,
        tag: REST_TAG,
        icon: './apple-touch-icon.png',
        badge: './notification-badge.png',
        lang,
        dir: lang === 'he' ? 'rtl' : 'ltr',
        // Updates replace it quietly; only the moment the rest ends sounds.
        silent: !alert,
        renotify: alert,
        // Android shows this as the notification's time, so once the rest is
        // over it reads "2m" and keeps telling how long ago it ended.
        timestamp: endsAt,
        data: { url: '' },
      })
    } catch (e) {
      console.error(e)
    }
  })
  return lockQueue
}

export function clearRestNotification() {
  lockQueue = lockQueue.then(async () => {
    try {
      const reg = await swRegistration()
      const list = (await reg?.getNotifications({ tag: REST_TAG })) || []
      list.forEach((n) => n.close())
    } catch (e) {
      console.error(e)
    }
  })
  return lockQueue
}
