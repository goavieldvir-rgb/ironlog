// Finished workouts that couldn't reach the server yet (no signal at the
// gym, a dropped connection mid-save). Each one waits in this browser's
// local storage and is sent again as soon as the connection is back, so a
// workout is never lost just because Finish was tapped in a basement.
//
// Sending twice is harmless: every workout carries an id made on the phone
// when it starts, and logSession upserts on that id.
//
// Kept per signed-in account (the one holding the phone), with the account
// the workout belongs to stored inside, so a coach logging for a trainee
// offline still syncs it to the trainee. Signing out keeps the queue: it's
// only sent, or shown, when that same account signs in again.

import { useCallback, useEffect, useRef, useState } from 'react'

const PREFIX = 'ironlog:outbox:'
export const CHANGED = 'ironlog:outbox-changed'

const keyFor = (authUid, sessionId) => `${PREFIX}${authUid}:${sessionId}`

function notify() {
  try {
    window.dispatchEvent(new Event(CHANGED))
  } catch {
    // no window (tests): nothing to tell
  }
}

// True when a failed save looks like the network, not the data: the phone
// says it's offline, or the request never got an answer. Supabase reports
// those with an empty code and a "TypeError: Failed to fetch"-style message.
export function isNetworkError(err) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  if (!err) return false
  if (err instanceof TypeError) return true
  const msg = String(err.message || '')
  if (/failed to fetch|load failed|networkerror|network request failed|network connection was lost/i.test(msg)) return true
  return !err.code && /^(TypeError|FetchError|AbortError)\b/.test(msg)
}

// Puts a finished workout in the queue. Returns false when storage isn't
// available, so the caller can keep the draft instead.
export function queueSession(authUid, targetUid, session) {
  if (!authUid || !targetUid || !session?.id) return false
  try {
    localStorage.setItem(keyFor(authUid, session.id), JSON.stringify({ targetUid, session, queuedAt: Date.now() }))
    notify()
    return true
  } catch {
    return false
  }
}

// Everything waiting for this account, oldest first.
export function listQueued(authUid) {
  if (!authUid) return []
  const prefix = `${PREFIX}${authUid}:`
  const out = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith(prefix)) continue
      try {
        const item = JSON.parse(localStorage.getItem(key))
        if (item?.session && item?.targetUid) out.push({ ...item, key })
      } catch {
        // skip anything unreadable rather than breaking the queue
      }
    }
  } catch {
    return []
  }
  return out.sort((a, b) => (a.queuedAt || 0) - (b.queuedAt || 0))
}

function remove(key) {
  try {
    localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

function markFailed(item) {
  try {
    const { key, ...rest } = item
    localStorage.setItem(key, JSON.stringify({ ...rest, attempts: (rest.attempts || 0) + 1, lastTriedAt: Date.now() }))
  } catch {
    // ignore
  }
}

// Sends what's waiting, one at a time. Stops at the first network failure
// (the rest would fail the same way). Anything the server rejects for
// another reason stays queued too: a workout is never thrown away here.
// `send(targetUid, session)` is logSession; passed in so this file has no
// database import. Returns how many this call sent: a call made while a
// send is already under way waits for it and returns 0, so it's only
// announced once.
let running = null
export function flushOutbox(authUid, send) {
  if (running) return running.then(() => 0)
  running = (async () => {
    let sent = 0
    for (const item of listQueued(authUid)) {
      try {
        await send(item.targetUid, item.session)
        remove(item.key)
        sent++
      } catch (err) {
        console.error(err)
        markFailed(item)
        if (isNetworkError(err)) break
      }
    }
    if (sent) notify()
    return sent
  })().finally(() => {
    running = null
  })
  return running
}

const RETRY_MS = 30 * 1000

// How many workouts are waiting, kept up to date, and sends them whenever
// the app is open with a connection: on start, when the phone comes back
// online or the app back to the front, and every half minute while any wait.
// `onSynced(n)` runs after n were sent.
export function useOutbox(authUid, send, onSynced) {
  const [count, setCount] = useState(() => listQueued(authUid).length)
  const [syncing, setSyncing] = useState(false)
  // Latest callbacks, so a new function each render doesn't restart syncing.
  const cb = useRef({ send, onSynced })
  cb.current = { send, onSynced }

  const syncNow = useCallback(async () => {
    if (!authUid || !listQueued(authUid).length) return 0
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0
    setSyncing(true)
    try {
      const sent = await flushOutbox(authUid, cb.current.send)
      if (sent) cb.current.onSynced?.(sent)
      return sent
    } finally {
      setSyncing(false)
      setCount(listQueued(authUid).length)
    }
  }, [authUid])

  useEffect(() => {
    const refresh = () => setCount(listQueued(authUid).length)
    const onStorage = (e) => {
      if (!e.key || e.key.startsWith(PREFIX)) refresh()
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') syncNow()
    }
    refresh()
    syncNow()
    window.addEventListener(CHANGED, refresh)
    window.addEventListener('storage', onStorage)
    window.addEventListener('online', syncNow)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener(CHANGED, refresh)
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('online', syncNow)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [authUid, syncNow])

  useEffect(() => {
    if (!count) return
    const timer = setInterval(syncNow, RETRY_MS)
    return () => clearInterval(timer)
  }, [count, syncNow])

  return { count, syncing, syncNow }
}
