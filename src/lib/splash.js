// The launch screen in index.html stays up while anything is holding it,
// so the app goes straight from it to a finished screen instead of passing
// through blank or half-loaded states. Once it has gone it never comes back:
// later waits use the in-app loader instead.
let holds = 0
let gone = false
let pending

export function splashShowing() {
  return !gone && !!document.getElementById('splash')
}

export function holdSplash() {
  holds++
  clearTimeout(pending)
  return () => {
    holds--
    // Deferred so a hold handed from one screen to the next in the same
    // render doesn't let the splash slip away in between.
    if (holds === 0) pending = setTimeout(hideSplash, 0)
  }
}

export function hideSplash() {
  if (gone) return
  gone = true
  const el = document.getElementById('splash')
  if (!el) return
  el.classList.add('is-out')
  // transitionend doesn't fire if the tab is hidden, so don't rely on it.
  setTimeout(() => el.remove(), 250)
}
