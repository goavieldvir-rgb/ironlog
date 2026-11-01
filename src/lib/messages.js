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
const store = { unread: 0 }
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

// Unread messages from the coach, for the trainee's own thread.
export async function fetchUnreadForTrainee(uid) {
  const rows = check(
    await supabase.from('coach_messages').select('id, sender_id, read_at').eq('trainee_id', uid).is('read_at', null).neq('sender_id', uid).limit(100),
    [],
  )
  return (rows || []).filter((r) => r.sender_id !== uid && !r.read_at).length
}

// Coach side: { traineeId: unreadCount } over every thread, one query.
export async function fetchUnreadByTrainee() {
  const rows = check(
    await supabase.from('coach_messages').select('trainee_id, sender_id, read_at').is('read_at', null).limit(1000),
    [],
  )
  const out = {}
  // Only the trainee's own messages wait for the coach.
  for (const r of rows || []) if (r.sender_id === r.trainee_id && !r.read_at) out[r.trainee_id] = (out[r.trainee_id] || 0) + 1
  return out
}

let inflight = null
export function refreshUnread(uid) {
  if (!uid || missing) return Promise.resolve()
  if (inflight) return inflight
  inflight = fetchUnreadForTrainee(uid)
    .then((n) => {
      if (store.unread !== n) {
        store.unread = n
        notify()
      }
    })
    .catch((e) => console.error(e))
    .finally(() => {
      inflight = null
    })
  return inflight
}

// Trainee-side state for the More sheet and Home: whether messages exist at
// all, and how many coach messages are unread. Always off for coaches.
export function useMessagesState() {
  const { user } = useAuth()
  const { isAdmin, loadingProfile } = useAdmin()
  const { pathname } = useLocation()
  const [, tick] = useState(0)
  const uid = user?.uid
  const active = !!uid && !isAdmin && !loadingProfile

  useEffect(() => {
    const fn = () => tick((n) => n + 1)
    listeners.add(fn)
    return () => listeners.delete(fn)
  }, [])

  // Look again whenever the person moves between screens (the Messages
  // screen marks things read, a new message may have arrived) or comes back
  // to the app.
  useEffect(() => {
    if (!active) return
    refreshUnread(uid)
    const onVis = () => document.visibilityState === 'visible' && refreshUnread(uid)
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [active, uid, pathname])

  return { enabled: active && !missing, unread: active && !missing ? store.unread : 0 }
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

// After the trainee opened the thread.
export function clearUnread() {
  if (store.unread) {
    store.unread = 0
    notify()
  }
}
