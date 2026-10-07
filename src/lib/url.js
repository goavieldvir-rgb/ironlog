// People paste links the way they see them — "youtube.com/watch?v=…" or
// with a stray space from a share sheet. The browser's URL field rejects
// anything without https:// and just refuses to submit, with no clear
// reason. Fixing the link up ourselves is friendlier than being strict.
export function normalizeVideoUrl(raw) {
  const s = String(raw || '').trim()
  if (!s) return ''
  if (/^https?:\/\//i.test(s)) return s
  return `https://${s.replace(/^\/+/, '')}`
}

// Only web links are ever opened from a saved video link. Anything else
// (for example "javascript:…") could run code when someone taps it, and the
// link may have been saved by a different account than the one viewing it.
export function safeVideoUrl(raw) {
  const s = String(raw || '').trim()
  return /^https?:\/\//i.test(s) ? s : ''
}
