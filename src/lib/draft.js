// Autosaves an in-progress workout session to the browser's local storage,
// so if Safari (or any browser) reloads the tab after being backgrounded —
// a well-known iOS quirk — the person doesn't lose everything they'd
// already logged. Scoped per account (effectiveUid) so admin "acting as"
// someone else never mixes drafts between people, and per-browser only by
// design: this is meant to survive a reload of the same tab, not sync
// across devices.

const PREFIX = 'ironlog:draft:'

export function saveDraft(uid, draft) {
  if (!uid) return
  try {
    localStorage.setItem(PREFIX + uid, JSON.stringify({ ...draft, savedAt: Date.now() }))
  } catch {
    // Storage might be unavailable (private browsing, quota, etc.) —
    // autosave is a nice-to-have, not something that should ever break
    // the actual logging flow, so fail silently.
  }
}

export function loadDraft(uid) {
  if (!uid) return null
  try {
    const raw = localStorage.getItem(PREFIX + uid)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearDraft(uid) {
  if (!uid) return
  try {
    localStorage.removeItem(PREFIX + uid)
  } catch {
    // ignore
  }
}
