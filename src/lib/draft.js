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
    const raw = localStorage.getItem(storageKey(uid, routineKey))
    return raw ? JSON.parse(raw) : null
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
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith(prefix)) continue
      try {
        const draft = JSON.parse(localStorage.getItem(key))
        if (draft) out.push({ ...draft, routineKey: key.slice(prefix.length) })
      } catch {
        // skip anything unreadable rather than breaking the list
      }
    }
    return out.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
  } catch {
    return []
  }
}
