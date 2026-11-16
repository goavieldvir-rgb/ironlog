// Color math for the accent, with no app imports so the share card and the
// charts can use it too. See brand.js for where a coach's color comes from.
export const PALETTE = {
  ember: '255 91 58',
  red: '220 38 38',
  gold: '250 204 21',
  lime: '163 230 53',
  green: '22 163 74',
  mint: '74 222 128',
  teal: '45 212 191',
  sky: '56 189 248',
  royal: '37 99 235',
  navy: '30 58 138',
  violet: '167 139 250',
  purple: '124 58 237',
  pink: '244 114 182',
  grey: '142 142 150',
  mono: '242 242 239',
}

const DEFAULT_ACCENT = PALETTE.ember
const BG = [11, 11, 12] // the app's background (ink)
const INK = [11, 11, 12]
const WHITE = [255, 255, 255]

const toRgb = (color) => {
  if (/^#[0-9a-fA-F]{6}$/.test(color || '')) {
    const n = parseInt(color.slice(1), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  return (PALETTE[color] || DEFAULT_ACCENT).split(' ').map(Number)
}
const lum = ([r, g, b]) => {
  const ch = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
}
export const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}
// Raise the lightness (keeping the hue and saturation, so navy stays a
// blue rather than going grey) until the color stands out from the
// background by `min`.
const toHsl = ([r, g, b]) => {
  ;[r, g, b] = [r / 255, g / 255, b / 255]
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const l = (mx + mn) / 2
  if (mx === mn) return [0, 0, l]
  const d = mx - mn
  const sat = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h / 6, sat, l]
}
const fromHsl = ([h, sat, l]) => {
  if (!sat) return [l, l, l].map((v) => Math.round(v * 255))
  const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat
  const p = 2 * l - q
  const f = (t) => {
    t = (t + 1) % 1
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p
  }
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((v) => Math.round(v * 255))
}
const liftTo = (rgb, min) => {
  if (contrast(rgb, BG) >= min) return rgb
  const [h, sat, l0] = toHsl(rgb)
  for (let l = l0; l <= 1.0001; l += 0.01) {
    const c = fromHsl([h, sat, Math.min(l, 1)])
    if (contrast(c, BG) >= min) return c
  }
  return [255, 255, 255]
}

// The three shades the app needs from one coach color:
// - accent: buttons, dots, bars, chart lines. At least 3:1 on the dark
//   background, so navy or a dark custom color is lifted just enough to show.
// - fg: text on an accent button, dark or white, whichever reads better.
// - text: accent-colored words on the dark background (links, "Records"),
//   lifted further to 4.5:1.
export function accentTokens(color) {
  const accent = liftTo(toRgb(color), 3)
  const fg = contrast(accent, INK) >= contrast(accent, WHITE) ? INK : WHITE
  const text = liftTo(accent, 4.5)
  return { accent, fg, text }
}
export const hexOf = (rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()

