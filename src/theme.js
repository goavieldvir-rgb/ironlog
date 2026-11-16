// Mirrors the CSS custom properties in index.css for places that need a
// literal colour (chart libraries). Change the accent in both places.
export const ACCENT = '#FF5B3A'

// The accent right now: the coach's brand color when one is set (brand.js
// writes it to --accent), else ACCENT. Read it while rendering, never once at
// load, so charts and the share card follow the coach's look.
export function accentNow() {
  if (typeof document === 'undefined') return ACCENT
  const v = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
  const m = v.match(/^(\d+)\s+(\d+)\s+(\d+)$/)
  if (!m) return ACCENT
  return '#' + m.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase()
}
export const DANGER = '#E5484D'
export const CHALK = '#F2F2EF'
export const CHALKDIM = '#A3A3A8'
export const MUTED = '#3A3A40'
export const GRID = '#26262A'
export const SURFACE = '#151517'
