// Autosaves an in-progress workout to the browser's local storage, so if
// Safari (or any browser) reloads the tab after being backgrounded — a
// well-known iOS quirk — the person doesn't lose what they'd logged.
//
// Stored per account AND per routine. It used to be one slot per account,
// which meant opening a second routine silently overwrote an unfinished
// first one — easy to hit now that a day can hold a mobility, strength
// and cardio session. Each routine keeps its own, and a freestyle session
// gets its own slot too.
//
// Per-browser by design: this survives a reload of the same tab, it isn't
// meant to sync across devices.

const PREFIX = 'ironlog:draft:'
export const FREESTYLE_KEY = 'freestyle'

const DAY_MS = 24 * 60 * 60 * 1000
export const STALE_AFTER_DAYS = 3 // worth asking "finish or discard?"
export const EXPIRE_AFTER_DAYS = 14 // dropped on read

// Whole days since the draft was last autosaved (0 when unknown).
export function draftAgeDays(draft, now = Date.now()) {
  if (!draft?.savedAt) return 0
  return Math.max(0, Math.floor((now - draft.savedAt) / DAY_MS))
}
export const isStaleDraft = (draft, now = Date.now()) => draftAgeDays(draft, now) >= STALE_AFTER_DAYS
const isExpired = (draft, now = Date.now()) => draftAgeDays(draft, now) >= EXPIRE_AFTER_DAYS

function storageKey(uid, routineKey) {
  return `${PREFIX}${uid}:${routineKey || FREESTYLE_KEY}`
}

// Drafts saved before the one-per-routine change live under the old
// account-only key. Move them into their proper slot the first time we
// look, so nobody loses a workout they were part-way through when the
// update landed.
function migrateLegacy(uid) {
  try {
    const legacyKey = PREFIX + uid
    const raw = localStorage.getItem(legacyKey)
    if (!raw) return
    const draft = JSON.parse(raw)
    const target = storageKey(uid, draft?.routineId || FREESTYLE_KEY)
    if (!localStorage.getItem(target)) localStorage.setItem(target, raw)
    localStorage.removeItem(legacyKey)
  } catch {
    // ignore
  }
}

export function saveDraft(uid, routineKey, draft) {
  if (!uid) return
  try {
    localStorage.setItem(storageKey(uid, routineKey), JSON.stringify({ ...draft, savedAt: Date.now() }))
  } catch {
    // Storage might be unavailable (private browsing, quota, etc.) —
    // autosave is a nice-to-have, not something that should ever break
    // the actual logging flow, so fail silently.
  }
}

export function loadDraft(uid, routineKey) {
  if (!uid) return null
  try {
    migrateLegacy(uid)
    const key = storageKey(uid, routineKey)
    const raw = localStorage.getItem(key)
    const draft = raw ? JSON.parse(raw) : null
    // An abandoned workout shouldn't come back weeks later with old numbers.
    if (draft && isExpired(draft)) {
      localStorage.removeItem(key)
      return null
    }
    return draft
  } catch {
    return null
  }
}

export function clearDraft(uid, routineKey) {
  if (!uid) return
  try {
    localStorage.removeItem(storageKey(uid, routineKey))
  } catch {
    // ignore
  }
}

// Every unfinished workout for this account, newest first — the Dashboard
// lists them so a half-done session is never hidden.
export function listDrafts(uid) {
  if (!uid) return []
  try {
    migrateLegacy(uid)
    const prefix = `${PREFIX}${uid}:`
    const out = []
    const expired = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith(prefix)) continue
      try {
        const draft = JSON.parse(localStorage.getItem(key))
        if (draft && isExpired(draft)) expired.push(key)
        else if (draft) out.push({ ...draft, routineKey: key.slice(prefix.length) })
      } catch {
        // skip anything unreadable rather than breaking the list
      }
    }
    expired.forEach((key) => localStorage.removeItem(key)) // after the loop, so indexes stay put
    return out.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
  } catch {
    return []
  }
}

// Signing out leaves nothing of a workout behind on a shared phone.
export function clearAllDrafts() {
  try {
    const keys = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(PREFIX)) keys.push(key)
    }
    keys.forEach((key) => localStorage.removeItem(key))
  } catch {
    // private mode: nothing was stored
  }
}
