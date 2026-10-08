import { supabase } from '../supabase.js'

// Public half of the VAPID key pair — safe to ship. The private half lives
// only in the database's locked config table, never in the repo.
const VAPID_PUBLIC_KEY = 'BCpY9Nphil6kkD3ds5SbmLl4tokahz4EOz0DCrT0-gCWfsiKMUNmbl1jKm_CLVQ_3D56UoIU2Jfjje60lhp5u24'

export const DEFAULT_REMIND_TIME = '08:00'

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

// This device's saved reminder row (or null).
export async function getMyReminder(uid) {
  if (pushStatus() !== 'ready' || Notification.permission !== 'granted') return null
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return null
  const { data } = await supabase
    .from('push_subscriptions')
    .select('remind_time, tz')
    .eq('user_id', uid)
    .eq('endpoint', sub.endpoint)
    .maybeSingle()
  return data || null
}

// Must be called from a tap (iOS requires it for the permission prompt).
export async function enableReminder(uid, remindTime, lang) {
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('denied')
  const reg = await registration()
  const sub =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) }))
  await saveReminder(uid, sub, remindTime, lang)
}

async function saveReminder(uid, sub, remindTime, lang) {
  const j = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: uid,
      endpoint: j.endpoint,
      p256dh: j.keys.p256dh,
      auth: j.keys.auth,
      remind_time: remindTime,
      tz: currentTimeZone(),
      lang,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,endpoint' },
  )
  if (error) throw error
}

export async function updateReminder(uid, remindTime, lang) {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) throw new Error('no-subscription')
  await saveReminder(uid, sub, remindTime, lang)
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
