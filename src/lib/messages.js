import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../supabase.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useAdmin } from '../context/AdminContext.jsx'

// Coach <-> trainee messages (supabase-coach-messages.sql). One thread per
// trainee. Before the SQL has been run the table doesn't exist: every entry
// point hides itself quietly, and that fact is remembered for the session so
// we don't ask again on every screen.

const MISSING_KEY = 'ironlog:messages-missing'
export const MESSAGE_MAX = 2000
const THREAD_LIMIT = 200

let missing = false
try {
  missing = sessionStorage.getItem(MISSING_KEY) === '1'
} catch {
  // Private mode: the flag lives for this page load only.
}

const listeners = new Set()
const store = { unread: 0, latest: null, byTrainee: {}, threads: [] }
const notify = () => listeners.forEach((fn) => fn())

function isMissing(error) {
  const msg = `${error?.message || ''} ${error?.details || ''}`
  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    error?.code === 'PGRST202' ||
    /does not exist|schema cache/i.test(msg)
  )
}

// Throws real errors; a missing table/function flips the session flag and
// resolves to `fallback`.
function check({ data, error }, fallback) {
  if (!error) return data
  if (isMissing(error)) {
    if (!missing) {
      missing = true
      try {
        sessionStorage.setItem(MISSING_KEY, '1')
      } catch {
        // Not worth failing over.
      }
      notify()
    }
    return fallback
  }
  throw error
}

export const messagesMissing = () => missing

// Oldest first, newest 200.
export async function fetchThread(traineeId) {
  const rows = check(
    await supabase
      .from('coach_messages')
      .select('id, trainee_id, sender_id, body, created_at, read_at')
      .eq('trainee_id', traineeId)
      .order('created_at', { ascending: false })
      .limit(THREAD_LIMIT),
    [],
  )
  return (rows || []).slice().reverse()
}

// Returns the saved row, or null when the server sent nothing back.
export async function sendMessage({ traineeId, senderId, body }) {
  const rows = check(
    await supabase.from('coach_messages').insert({ trainee_id: traineeId, sender_id: senderId, body }).select('id, trainee_id, sender_id, body, created_at, read_at'),
    null,
  )
  return rows?.[0] || null
}

// The other side's messages in this thread become read.
export async function markThreadRead(traineeId) {
  check(await supabase.rpc('mark_messages_read', { p_trainee: traineeId }), null)
}

// Unread messages from the coach, for the trainee's own thread: the count
// and the newest one (for the card on Home).
export async function fetchUnreadForTrainee(uid) {
  const rows = check(
    await supabase
      .from('coach_messages')
      .select('id, sender_id, body, created_at, read_at')
      .eq('trainee_id', uid)
      .is('read_at', null)
      .neq('sender_id', uid)
      .order('created_at', { ascending: false })
      .limit(100),
    [],
  )
  const list = (rows || []).filter((r) => r.sender_id !== uid && !r.read_at)
  return { count: list.length, latest: list[0] || null }
}

// Coach side: { traineeId: unreadCount } over every thread, one query.
export async function fetchUnreadByTrainee() {
  return (await fetchCoachUnread()).byTrainee
}

// Coach side, everything the badges and the Home card need: the count per
// trainee, and the threads with unread messages, newest first, each with its
// newest message.
async function fetchCoachUnread() {
  const rows = check(
    await supabase
      .from('coach_messages')
      .select('trainee_id, sender_id, body, created_at, read_at')
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(1000),
    [],
  )
  const byTrainee = {}
  const threads = []
  // Only the trainee's own messages wait for the coach.
  for (const r of rows || []) {
    if (r.sender_id !== r.trainee_id || r.read_at) continue
    if (!byTrainee[r.trainee_id]) threads.push({ traineeId: r.trainee_id, latest: r })
    byTrainee[r.trainee_id] = (byTrainee[r.trainee_id] || 0) + 1
  }
  for (const th of threads) th.count = byTrainee[th.traineeId]
  return { byTrainee, threads }
}

// Names for the coach's Home card, looked up once per person.
const names = {}
async function loadNames(ids) {
  const need = ids.filter((id) => !(id in names))
  if (!need.length) return
  const { data } = await supabase.from('profiles').select('id, full_name, email').in('id', need)
  for (const p of data || []) names[p.id] = p.full_name || p.email?.split('@')[0] || ''
  for (const id of need) if (!(id in names)) names[id] = ''
}

// The number on the app icon (Home Screen app, Android, desktop Chrome).
function setIconBadge(n) {
  try {
    if (n > 0) navigator.setAppBadge?.(n)?.catch?.(() => {})
    else navigator.clearAppBadge?.()?.catch?.(() => {})
  } catch {
    // Not supported here.
  }
}

let inflight = null
let inflightKey = ''
// `coach` picks the coach's view (every trainee's thread) over the
// trainee's own thread.
export function refreshUnread(uid, coach = false) {
  if (!uid || missing) return Promise.resolve()
  const key = `${uid}:${coach}`
  if (inflight && inflightKey === key) return inflight
  inflightKey = key
  const job = coach
    ? fetchCoachUnread().then(async ({ byTrainee, threads }) => {
        await loadNames(threads.map((th) => th.traineeId)).catch((e) => console.error(e))
        return {
          unread: threads.reduce((a, th) => a + th.count, 0),
          latest: null,
          byTrainee,
          threads: threads.map((th) => ({ ...th, name: names[th.traineeId] || '' })),
        }
      })
    : fetchUnreadForTrainee(uid).then(({ count, latest }) => ({ unread: count, latest, byTrainee: {}, threads: [] }))
  inflight = job
    .then((next) => {
      const changed =
        store.unread !== next.unread ||
        store.latest?.id !== next.latest?.id ||
        JSON.stringify(store.byTrainee) !== JSON.stringify(next.byTrainee) ||
        store.threads.map((th) => th.traineeId + th.count + th.name).join() !== next.threads.map((th) => th.traineeId + th.count + th.name).join()
      Object.assign(store, next)
      setIconBadge(next.unread)
      if (changed) notify()
    })
    .catch((e) => console.error(e))
    .finally(() => {
      inflight = null
    })
  return inflight
}

// While the app is open and on screen, look for new messages this often.
// A push that arrives refreshes at once (the service worker says so).
const POLL_MS = 60_000

// Unread state for both sides. A trainee: `enabled` (the Messages screen
// exists), `unread` coach messages and the newest one in `latest`. A coach:
// `unread` across every trainee, `byTrainee` counts and `threads` (newest
// first, with name and newest message). The coach has no Messages screen, so
// `enabled` stays false for them.
export function useMessagesState() {
  const { user } = useAuth()
  const { isAdmin, loadingProfile } = useAdmin()
  const { pathname } = useLocation()
  const [, tick] = useState(0)
  const uid = user?.uid
  const active = !!uid && !loadingProfile
  const coach = !!isAdmin

  useEffect(() => {
    const fn = () => tick((n) => n + 1)
    listeners.add(fn)
    return () => listeners.delete(fn)
  }, [])

  // Look again whenever the person moves between screens (the thread marks
  // things read, a new message may have arrived), comes back to the app, a
  // push for a message lands, or a minute passes on screen.
  useEffect(() => {
    if (!active) return
    const run = () => refreshUnread(uid, coach)
    run()
    const onVis = () => document.visibilityState === 'visible' && run()
    const onSw = (e) => e.data?.type === 'ironlog-message' && run()
    const timer = setInterval(() => document.visibilityState === 'visible' && run(), POLL_MS)
    document.addEventListener('visibilitychange', onVis)
    navigator.serviceWorker?.addEventListener?.('message', onSw)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
      navigator.serviceWorker?.removeEventListener?.('message', onSw)
    }
  }, [active, uid, coach, pathname])

  const on = active && !missing
  return {
    enabled: on && !coach,
    unread: on ? store.unread : 0,
    latest: on && !coach ? store.latest : null,
    byTrainee: on && coach ? store.byTrainee : {},
    threads: on && coach ? store.threads : [],
  }
}

// Coach side: false once we learn the table isn't there.
export function useMessagesAvailable() {
  const [, tick] = useState(0)
  useEffect(() => {
    const fn = () => tick((n) => n + 1)
    listeners.add(fn)
    return () => listeners.delete(fn)
  }, [])
  return !missing
}

// After a thread was opened: the trainee's own, or (traineeId given) one of
// the coach's.
export function clearUnread(traineeId) {
  if (traineeId && store.byTrainee[traineeId]) {
    const n = store.byTrainee[traineeId]
    const { [traineeId]: _, ...rest } = store.byTrainee
    store.byTrainee = rest
    store.threads = store.threads.filter((th) => th.traineeId !== traineeId)
    store.unread = Math.max(0, store.unread - n)
  } else if (!traineeId && store.unread) {
    store.unread = 0
    store.latest = null
  } else {
    return
  }
  setIconBadge(store.unread)
  notify()
}
