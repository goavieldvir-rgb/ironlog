// Draws the share picture for a finished workout on a canvas (no extra
// libraries) and hands it to the phone's share menu, falling back to a
// download where files can't be shared.
//
// The picture shows only four things on purpose: the workout's name, the
// big total (volume lifted, or distance for cardio, else time), the
// duration and the week streak. No exercises or sets, so it's easy to post
// and doesn't give the training plan away.
//
// Three looks: a plain Ironlog card, the stats designed into the trainee's
// own photo, and a see-through sticker (the photo look without the photo).
// They follow the app's own look: one typeface, sentence-case labels, the
// neutral ladder from the Tailwind theme, and the accent used once. The
// fonts are our own copies under public/fonts/share, loaded only when the
// workout screen opens so the rest of the app doesn't get heavier. Cards are
// a 1080 x 1920 Instagram story; everything stays between y=250 and y=1670
// because Instagram puts its own buttons at the top and bottom. Photos are
// only ever drawn on this phone.
import tailwind from '../../tailwind.config.js'
import { ACCENT } from '../theme.js'

const W = 1080
const H = 1920
const M = 96 // side margin
const T = tailwind.theme.extend.colors
const C = { ink: T.ink, chalk: T.chalk, dim: T.chalkdim, line: T.line, accent: ACCENT }

// The app's own pair: Geist for Latin and numbers, IBM Plex Sans Hebrew for
// Hebrew letters (the browser picks per letter, so mixed names just work).
// The families carry an "IL " prefix so the card never depends on the app's
// Google Fonts stylesheet having loaded.
const SANS = '"IL Geist", "IL Plex Hebrew", Geist, "IBM Plex Sans Hebrew", system-ui, sans-serif'

// Self-hosted woff2 files (latin / hebrew subsets). Geist is a variable
// font, so one file covers every weight.
const LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD'
const HEBREW = 'U+0307-0308, U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F'
const FACES = [
  ['IL Geist', 'geist-latin', '100 900', LATIN],
  ['IL Plex Hebrew', 'plex-hebrew-500', '500', HEBREW],
  ['IL Plex Hebrew', 'plex-hebrew-600', '600', HEBREW],
]

// All the faces load once; everyone waits on the same promise (true when
// every file arrived). Waiting for it is always capped, so a slow or blocked
// connection can never hold up the Share buttons - but the load carries on,
// and shareFontsReady() lets the recap redraw once it finishes.
const FONT_WAIT_MS = 3000
let fontsPromise = null
let fontsDone = false
export function shareFontsReady() {
  if (fontsPromise) return fontsPromise
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') return (fontsPromise = Promise.resolve(false))
  const mine = (fontsPromise = Promise.all(
    FACES.map(async ([family, file, weight, unicodeRange]) => {
      try {
        const url = new URL(`fonts/share/${file}.woff2`, document.baseURI)
        const face = new FontFace(family, `url("${url.href}") format("woff2")`, { weight, unicodeRange })
        document.fonts.add(face)
        await face.load()
        return true
      } catch {
        return false
      }
    }),
  ).then((r) => {
    fontsDone = r.every(Boolean)
    // A failed face (offline, bad connection) must not stick: the next card retries.
    if (!fontsDone && fontsPromise === mine) fontsPromise = null
    return fontsDone
  }))
  return mine
}
// True once every share font has arrived (so a redraw would change nothing).
export const shareFontsLoaded = () => fontsDone

async function waitForFonts() {
  await Promise.race([shareFontsReady(), new Promise((resolve) => setTimeout(resolve, FONT_WAIT_MS))])
}

// Called when the workout screen opens, so the fonts are already on the phone
// by the time the workout is finished.
export function preloadShareFonts() {
  shareFontsReady().catch(() => {})
}

function fit(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1)
  return `${t}…`
}

// Like fit(), but drops whole words first, so a cut name ends on a word.
function fitWords(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text
  const words = text.split(' ')
  while (words.length > 1) {
    words.pop()
    const t = `${words.join(' ')}…`
    if (ctx.measureText(t).width <= maxW) return t
  }
  return fit(ctx, text, maxW)
}

// ---- text painting -------------------------------------------------------
// Every piece of text goes through put(). Photo and plain cards just fill
// (photo with a soft shadow). The sticker has to read on ANY background, so
// each element is painted in two passes: first a tight dark outline plus a
// wide soft shadow, then the fill with a tight shadow on top.
let FX = null // { sticker, shadow: { color, blur, y } } for the picture being drawn
let PASS = 'fill'

const fontPx = (ctx) => parseFloat(/(\d+(?:\.\d+)?)px/.exec(ctx.font)?.[1] || '30')

function setShadow(ctx, color, blur, offsetY = 0) {
  ctx.shadowColor = color || 'transparent'
  ctx.shadowBlur = color ? blur : 0
  ctx.shadowOffsetY = color ? offsetY : 0
}

function put(ctx, text, x, y) {
  ctx.save()
  if (FX?.sticker && PASS === 'stroke') {
    // no hard outline (it made the letters look cut out): a wide, soft
    // shadow under the letters keeps them readable on light stories
    setShadow(ctx, 'rgba(0,0,0,0.38)', Math.max(12, fontPx(ctx) * 0.35), Math.round(fontPx(ctx) * 0.04))
    ctx.fillText(text, x, y)
  } else {
    if (FX?.shadow) setShadow(ctx, FX.shadow.color, FX.shadow.blur, FX.shadow.y)
    ctx.fillText(text, x, y)
  }
  ctx.restore()
}

// Runs the drawing once, or twice (outline, then fill) for the sticker.
function passes(fn) {
  if (FX?.sticker) {
    PASS = 'stroke'
    fn()
  }
  PASS = 'fill'
  fn()
}

// Sets the font, with optional tracking in em (negative = tighter, like the
// app's headings). Browsers without canvas letterSpacing just draw at the
// font's own spacing.
function setFont(ctx, weight, px, em = 0) {
  ctx.font = `${weight} ${px}px ${SANS}`
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${(px * em).toFixed(2)}px`
}

// '#FF5B3A' + alpha -> 'rgba(255,91,58,a)'
function tint(hex, a) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

// The hero number and the small ones. Hero: volume lifted, else cardio
// distance, else duration, else set count. Small: duration, streak and, when
// the workout broke any, the number of records (drawn in the accent).
function pickStats(summary, labels) {
  const duration = summary.durationMinutes || (summary.cardioMinutes > 0 ? summary.cardioMinutes : null)
  const dist = summary.cardioDistance != null ? Math.round(summary.cardioDistance * 100) / 100 : null
  const stats = {
    volume: summary.volume > 0 && { label: labels.volume, value: summary.volume.toLocaleString('en-US'), unit: summary.volumeUnit },
    distance: dist > 0 && { label: labels.distance, value: String(dist), unit: summary.cardioUnit },
    duration: duration && { label: labels.duration, value: String(duration), unit: labels.min },
    sets: { label: labels.sets, value: String(summary.setCount), unit: '' },
    streak: summary.streakWeeks > 0 && { label: labels.streak, value: String(summary.streakWeeks), unit: labels.weekUnit },
    records: summary.prCount > 0 && labels.records && { label: labels.records, value: String(summary.prCount), unit: '', accent: true },
  }
  const heroKey = ['volume', 'distance', 'duration', 'sets'].find((k) => stats[k])
  const small = ['duration', 'streak', 'records'].filter((k) => k !== heroKey && stats[k]).map((k) => stats[k])
  return { hero: stats[heroKey], small, heroKey }
}

const isHeb = (s) => /[֐-׿]/.test(s)

// A small sentence-case caption. `x` is the edge on the reading-start side
// (or the end side when `end` is set); long captions are cut to fit `maxW`.
// Returns the width drawn.
function drawLabel(ctx, text, x, y, { rtl, size, weight = 500, color, maxW = W, end = false }) {
  setFont(ctx, weight, size)
  ctx.fillStyle = color
  ctx.direction = rtl ? 'rtl' : 'ltr'
  ctx.textAlign = (rtl ? !end : end) ? 'right' : 'left'
  const t = fit(ctx, text, maxW)
  put(ctx, t, x, y)
  return ctx.measureText(t).width
}

// Width of "value + gap + unit" with the value at `size` px.
function valueWidth(ctx, st, size, unitPx, gap) {
  setFont(ctx, 600, size, -0.04)
  const vw = ctx.measureText(st.value).width
  if (!st.unit) return vw
  setFont(ctx, 500, unitPx, -0.01)
  return vw + gap + ctx.measureText(st.unit).width
}

// Biggest size (from `max` down to `min`) at which value + unit fit `maxW`;
// the unit scales with it. If even the smallest doesn't fit, the number is
// cut with an ellipsis.
function fitStat(ctx, st, { max, min, unit, gap, maxW }) {
  const unitAt = (s) => Math.round((s * unit) / max)
  let size = max
  while (size > min && valueWidth(ctx, st, size, unitAt(size), gap) > maxW) size -= 4
  let out = st
  if (valueWidth(ctx, st, size, unitAt(size), gap) > maxW) {
    let v = st.value
    while (v.length > 1 && valueWidth(ctx, { ...st, value: `${v}…` }, size, unitAt(size), gap) > maxW) v = v.slice(0, -1)
    out = { ...st, value: `${v}…` }
  }
  return { st: out, size, unitPx: unitAt(size), width: valueWidth(ctx, out, size, unitAt(size), gap) }
}

// Value with its unit right after it (on the end side), the unit in the
// accent. Left to right the value starts at x; in Hebrew it starts at x and
// the unit sits to its left.
function drawValue(ctx, f, x, y, { rtl, gap, color, unitColor }) {
  const { st, size, unitPx } = f
  ctx.direction = 'ltr'
  ctx.textAlign = rtl ? 'right' : 'left'
  ctx.fillStyle = st.accent ? C.accent : color
  setFont(ctx, 600, size, -0.04)
  put(ctx, st.value, x, y)
  if (!st.unit) return
  const vw = ctx.measureText(st.value).width
  ctx.fillStyle = unitColor
  setFont(ctx, 500, unitPx, -0.01)
  ctx.direction = isHeb(st.unit) ? 'rtl' : 'ltr'
  put(ctx, st.unit, rtl ? x - vw - gap : x + vw + gap, y)
}

// Do these words fit on two lines of maxW with greedy wrapping?
function twoLines(ctx, words, maxW) {
  let lines = 1
  let cur = ''
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (ctx.measureText(next).width <= maxW) cur = next
    else if (ctx.measureText(w).width > maxW) return false
    else if (++lines > 2) return false
    else cur = w
  }
  return true
}

// Workout name as the trainee typed it. Long names wrap at spaces onto at
// most two lines (stepping down to 80% first); whatever still doesn't fit on
// line two is cut with an ellipsis.
function layoutName(ctx, summary, { size: top }) {
  const text = summary.routineName.trim()
  ctx.direction = isHeb(text) ? 'rtl' : 'ltr'
  const maxW = W - M * 2
  const words = text.split(/\s+/)
  let size = top
  for (; size > top * 0.8; size -= 4) {
    setFont(ctx, 600, size, -0.03)
    if (twoLines(ctx, words, maxW)) break
  }
  setFont(ctx, 600, size, -0.03)
  let line1 = ''
  let i = 0
  while (i < words.length) {
    const next = line1 ? `${line1} ${words[i]}` : words[i]
    if (ctx.measureText(next).width > maxW && line1) break
    line1 = next
    i++
  }
  // a single word wider than the card is cut, and the rest goes below
  const lines = [ctx.measureText(line1).width > maxW ? fit(ctx, line1, maxW) : line1]
  if (i < words.length) lines.push(fitWords(ctx, words.slice(i).join(' '), maxW))
  return { lines, size, lh: Math.round(size * 1.04) }
}

function drawName(ctx, nm, x, y, { rtl, color }) {
  setFont(ctx, 600, nm.size, -0.03)
  ctx.fillStyle = color
  ctx.direction = rtl ? 'rtl' : 'ltr'
  ctx.textAlign = rtl ? 'right' : 'left'
  nm.lines.forEach((ln, i) => put(ctx, ln, x, y + i * nm.lh))
}

// The wordmark: a small accent dot and the name.
function drawBrand(ctx, x, y, { rtl, color, size = 44 }) {
  setFont(ctx, 600, size, -0.02)
  const tw = ctx.measureText('Ironlog').width
  const d = Math.round(size * 0.3) // dot diameter
  const gap = Math.round(size * 0.24)
  const total = d + gap + tw
  const left = rtl ? x - total : x
  passes(() => {
    if (!(FX?.sticker && PASS === 'stroke')) {
      ctx.save()
      if (FX?.shadow) setShadow(ctx, FX.shadow.color, FX.shadow.blur, FX.shadow.y)
      ctx.fillStyle = C.accent
      ctx.beginPath()
      ctx.arc(left + d / 2, y - Math.round(size * 0.34), d / 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
    ctx.direction = 'ltr'
    ctx.textAlign = 'left'
    ctx.fillStyle = color
    setFont(ctx, 600, size, -0.02)
    put(ctx, 'Ironlog', left + d + gap, y)
  })
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r)
  else ctx.rect(x, y, w, h)
}

// The accent pill ("Workout complete"). `top` is its top edge; returns its
// height. It sits on the reading-start side.
function drawPill(ctx, text, x, top, { rtl, size = 30 }) {
  if (!text) return 0
  setFont(ctx, 600, size, -0.01)
  const h = Math.round(size * 2.1)
  const pad = Math.round(size * 0.9)
  const dot = Math.round(size * 0.32)
  const tw = Math.min(ctx.measureText(text).width, W - M * 2 - pad * 2 - dot * 3)
  const w = tw + pad * 2 + dot * 2 + Math.round(size * 0.45)
  const left = rtl ? x - w : x
  passes(() => {
    ctx.save()
    if (FX?.sticker && PASS === 'stroke') {
      setShadow(ctx, 'rgba(0,0,0,0.45)', 24)
    } else if (FX?.shadow) setShadow(ctx, FX.shadow.color, FX.shadow.blur, FX.shadow.y)
    ctx.fillStyle = C.accent
    roundRect(ctx, left, top, w, h, h / 2)
    ctx.fill()
    ctx.restore()
    if (FX?.sticker && PASS === 'stroke') return
    // a small ink dot, then the words, in ink on the accent
    ctx.fillStyle = C.ink
    const cx = rtl ? left + w - pad - dot : left + pad + dot
    ctx.beginPath()
    ctx.arc(cx, top + h / 2, dot, 0, Math.PI * 2)
    ctx.fill()
    setFont(ctx, 600, size, -0.01)
    ctx.direction = rtl ? 'rtl' : 'ltr'
    ctx.textAlign = rtl ? 'right' : 'left'
    const tx = rtl ? cx - dot - Math.round(size * 0.45) : cx + dot + Math.round(size * 0.45)
    ctx.fillText(fit(ctx, text, tw + 1), tx, top + h / 2 + Math.round(size * 0.36))
  })
  return h
}

// Pill, name, the hero number with its label under it, then the small
// numbers in a row. Used for both the photo picture and the sticker so they
// are one design. Anchored by the pill's top (`top`) or by the last label's
// baseline (`bottom`); a two-line name grows away from the anchor. Returns
// the baseline of the last row.
function drawOverlayBlock(ctx, summary, { rtl, labels, top, bottom, labelColor, unitColor = C.accent }) {
  const x0 = rtl ? W - M : M
  const full = W - M * 2
  const { hero, small } = pickStats(summary, labels)
  const nm = layoutName(ctx, summary, { size: 68 })
  const heroFit = fitStat(ctx, hero, { max: 176, min: 110, unit: 52, gap: 12, maxW: full })
  const smallFits = small.map((st) => fitStat(ctx, st, { max: 76, min: 48, unit: 28, gap: 6, maxW: full / 3 - 40 }))
  const smallSize = Math.max(0, ...smallFits.map((f) => f.size))
  // The small stats sit side by side with a fixed gap, each column as wide
  // as its number or its label, so the block stays compact on a photo.
  const STAT_GAP = 64
  setFont(ctx, 500, 26)
  const colX = []
  let run = 0
  smallFits.forEach((f) => {
    colX.push(run)
    run += Math.max(f.width, ctx.measureText(f.st.label).width) + STAT_GAP
  })

  // positions relative to the pill's top
  const pillH = Math.round(26 * 2.1)
  const nameY = pillH + 32 + Math.round(nm.size * 0.74)
  const lastName = nameY + (nm.lines.length - 1) * nm.lh
  const heroY = lastName + 36 + Math.round(heroFit.size * 0.72)
  const heroLabelY = heroY + Math.round(heroFit.size * 0.16) + 44 // clears the comma's tail
  const smallY = heroLabelY + 44 + Math.round(smallSize * 0.72)
  const smallLabelY = smallY + 40
  const rel = small.length ? smallLabelY : heroLabelY
  const base = top != null ? top : bottom - rel

  drawPill(ctx, labels.eyebrow, x0, base, { rtl, size: 26 })
  passes(() => {
    drawName(ctx, nm, x0, base + nameY, { rtl, color: '#FFFFFF' })
    drawValue(ctx, heroFit, x0, base + heroY, { rtl, gap: 14, color: '#FFFFFF', unitColor })
    drawLabel(ctx, hero.label, x0, base + heroLabelY, { rtl, size: 28, color: labelColor, maxW: full })
    smallFits.forEach((f, i) => {
      const x = rtl ? x0 - colX[i] : x0 + colX[i]
      drawValue(ctx, f, x, base + smallY, { rtl, gap: 6, color: '#FFFFFF', unitColor })
      drawLabel(ctx, f.st.label, x, base + smallLabelY, { rtl, size: 26, color: labelColor, maxW: full / 3 })
    })
  })
  return base + rel
}

// Fill-and-crop a photo to cover the whole story.
function drawPhoto(ctx, photo) {
  const scale = Math.max(W / photo.width, H / photo.height)
  const dw = photo.width * scale
  const dh = photo.height * scale
  ctx.drawImage(photo.source, (W - dw) / 2, (H - dh) / 2, dw, dh)
}

// Fine film grain over the plain card, so the glow reads as light rather
// than a flat gradient. Seeded, so the same workout always draws the same.
function drawGrain(ctx) {
  const n = document.createElement('canvas')
  n.width = n.height = 192
  const nctx = n.getContext('2d')
  const img = nctx.createImageData(192, 192)
  let seed = 7
  for (let i = 0; i < img.data.length; i += 4) {
    seed = (seed * 16807) % 2147483647
    const v = seed % 256
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v
    img.data[i + 3] = 255
  }
  nctx.putImageData(img, 0, 0)
  ctx.save()
  ctx.globalAlpha = 0.05
  ctx.globalCompositeOperation = 'overlay'
  ctx.fillStyle = ctx.createPattern(n, 'repeat')
  ctx.fillRect(0, 0, W, H)
  ctx.restore()
}

// The plain card: a dark story lit by the accent from below, the workout's
// name, one huge number, and the rest on frosted tiles.
function drawPlain(ctx, summary, { rtl, labels }) {
  const x0 = rtl ? W - M : M
  const xEnd = rtl ? M : W - M
  const full = W - M * 2
  ctx.fillStyle = C.ink
  ctx.fillRect(0, 0, W, H)
  // accent light rising from the bottom end corner, and a softer one at the
  // top start corner so the card isn't lopsided
  const ex = rtl ? 0 : W
  const g1 = ctx.createRadialGradient(ex, H + 120, 0, ex, H + 120, 1500)
  g1.addColorStop(0, tint(C.accent, 0.75))
  g1.addColorStop(0.35, tint(C.accent, 0.28))
  g1.addColorStop(1, tint(C.accent, 0))
  ctx.fillStyle = g1
  ctx.fillRect(0, 0, W, H)
  const sx = rtl ? W : 0
  const g2 = ctx.createRadialGradient(sx, -100, 0, sx, -100, 1000)
  g2.addColorStop(0, tint(C.accent, 0.16))
  g2.addColorStop(1, tint(C.accent, 0))
  ctx.fillStyle = g2
  ctx.fillRect(0, 0, W, H)
  drawGrain(ctx)
  ctx.textBaseline = 'alphabetic'

  // top row: wordmark at the start, the date at the end
  drawBrand(ctx, x0, 316, { rtl, color: C.chalk })
  if (summary.date) {
    const d = new Date(`${summary.date}T00:00:00`)
    const text = d.toLocaleDateString(rtl ? 'he-IL' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })
    drawLabel(ctx, text, xEnd, 314, { rtl, size: 30, color: C.dim, end: true, maxW: full / 2 })
  }

  const { hero, small, heroKey } = pickStats(summary, labels)
  const heroLabel = heroKey === 'volume' && labels.totalVolume ? labels.totalVolume : hero.label
  const nm = layoutName(ctx, summary, { size: 112 })
  const heroFit = fitStat(ctx, hero, { max: 330, min: 170, unit: 92, gap: 18, maxW: full })
  const cols = Math.max(1, small.length)
  const tileGap = 20
  const tileW = (full - tileGap * (cols - 1)) / cols
  const smallFits = small.map((st) => fitStat(ctx, st, { max: 112, min: 64, unit: 38, gap: 8, maxW: tileW - 64 }))
  const smallSize = Math.max(0, ...smallFits.map((f) => f.size))

  // Positions relative to the pill's top, then the whole block is centred
  // between the top row and the bottom of the story's safe area.
  const pillH = Math.round(30 * 2.1)
  const nameY = pillH + 44 + Math.round(nm.size * 0.74)
  const lastName = nameY + (nm.lines.length - 1) * nm.lh
  const heroY = lastName + 56 + Math.round(heroFit.size * 0.72)
  const heroLabelY = heroY + Math.round(heroFit.size * 0.16) + 56 // clears the comma's tail
  const tilesTop = heroLabelY + 68
  const tileH = 64 + Math.round(smallSize * 0.72) + 72
  const bottom = small.length ? tilesTop + tileH : heroLabelY
  const dy = Math.max(Math.round((430 + 1650) / 2 - bottom / 2), 430)

  drawPill(ctx, labels.eyebrow, x0, dy, { rtl, size: 30 })
  drawName(ctx, nm, x0, dy + nameY, { rtl, color: C.chalk })
  drawValue(ctx, heroFit, x0, dy + heroY, { rtl, gap: 18, color: C.chalk, unitColor: C.accent })
  drawLabel(ctx, heroLabel, x0, dy + heroLabelY, { rtl, size: 34, color: C.dim, maxW: full })

  smallFits.forEach((f, i) => {
    const left = rtl ? W - M - (i + 1) * tileW - i * tileGap : M + i * (tileW + tileGap)
    const top = dy + tilesTop
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    roundRect(ctx, left, top, tileW, tileH, 28)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 2
    ctx.stroke()
    const x = rtl ? left + tileW - 32 : left + 32
    drawValue(ctx, f, x, top + 52 + Math.round(smallSize * 0.72), { rtl, gap: 8, color: C.chalk, unitColor: C.accent })
    drawLabel(ctx, f.st.label, x, top + tileH - 36, { rtl, size: 28, color: C.dim, maxW: tileW - 64 })
  })
}

// variant: 'plain' (default), 'photo' (needs `photo`) or 'sticker'.
// labels: { eyebrow, totalVolume, duration, volume, distance, sets, streak, weekUnit, min, records }
export function renderShareCard(summary, { rtl, labels, variant = 'plain', photo = null }) {
  const canvas = document.createElement('canvas')
  canvas.width = W
  const ctx = canvas.getContext('2d')
  ctx.textBaseline = 'alphabetic'
  try {
    if (variant === 'sticker') return renderSticker(summary, { rtl, labels })
    canvas.height = H
    if (variant === 'photo' && photo) {
      // The photo is never darkened. The text carries the same soft shadow
      // as the sticker instead, which keeps it readable on bright photos.
      drawPhoto(ctx, photo)
      FX = { sticker: true, shadow: { color: 'rgba(0,0,0,0.22)', blur: 6, y: 1 } }
      drawBrand(ctx, rtl ? W - M : M, 316, { rtl, color: '#FFFFFF' })
      const white = 'rgba(255,255,255,0.92)'
      drawOverlayBlock(ctx, summary, { rtl, labels, bottom: 1640, labelColor: white, unitColor: white })
      return canvas
    }
    FX = null
    drawPlain(ctx, summary, { rtl, labels })
    return canvas
  } finally {
    FX = null
    PASS = 'fill'
  }
}

// The sticker is drawn big on a scratch canvas, then cut down to its ink
// (anything that isn't see-through) plus an even 40px all round.
function renderSticker(summary, { rtl, labels }) {
  const PAD = 40
  const scratch = document.createElement('canvas')
  scratch.width = W
  scratch.height = 1200
  const sctx = scratch.getContext('2d', { willReadFrequently: true })
  sctx.textBaseline = 'alphabetic'
  FX = { sticker: true, shadow: { color: 'rgba(0,0,0,0.22)', blur: 6, y: 1 } }
  // labels stay near-white here: the sticker can land on anything
  // units in white too: the accent can vanish on a light story
  const bottom = drawOverlayBlock(sctx, summary, { rtl, labels, top: 120, labelColor: 'rgba(255,255,255,0.9)', unitColor: 'rgba(255,255,255,0.9)' })
  drawBrand(sctx, rtl ? W - M : M, bottom + 100, { rtl, color: '#FFFFFF', size: 38 })

  const { data, width, height } = sctx.getImageData(0, 0, scratch.width, scratch.height)
  let x0 = width
  let y0 = height
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  if (x1 < 0) return scratch
  const out = document.createElement('canvas')
  out.width = x1 - x0 + 1 + PAD * 2
  out.height = y1 - y0 + 1 + PAD * 2
  out.getContext('2d').drawImage(scratch, x0, y0, x1 - x0 + 1, y1 - y0 + 1, PAD, PAD, x1 - x0 + 1, y1 - y0 + 1)
  return out
}

const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality))

// Turns a photo the trainee picked into something drawImage can use, with
// phone-camera rotation (EXIF) applied so portrait shots aren't sideways.
// Huge photos are shrunk while decoding (the size is read first from an
// <img>, which only parses the header), so a 50 MP picture never becomes a
// full-size bitmap and can't run the phone out of memory. The file is read
// here only; it is never uploaded.
export async function loadPhoto(file) {
  const MAX = 2400
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    // onload gives the size without a full decode; naturalWidth/Height are
    // already camera-rotated in current browsers.
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = () => reject(new Error('NOT_AN_IMAGE'))
    })
    if (typeof createImageBitmap === 'function') {
      try {
        const w = img.naturalWidth
        const h = img.naturalHeight
        const opts = { imageOrientation: 'from-image' }
        if (Math.max(w, h) > MAX) {
          const s = MAX / Math.max(w, h)
          Object.assign(opts, { resizeWidth: Math.round(w * s), resizeHeight: Math.round(h * s), resizeQuality: 'high' })
        }
        const bmp = await createImageBitmap(file, opts)
        return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close?.() }
      } catch {
        /* fall through to the <img> itself */
      }
    }
    // Older browsers: the <img> applies the camera rotation by itself.
    await img.decode()
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} }
  } finally {
    URL.revokeObjectURL(url)
  }
}

// Waits for fonts, draws the card and turns it into a ready-to-share file.
// Done ahead of the Share tap: Safari drops the tap's permission to open the
// share menu if we're still busy making the picture when we ask for it.
// The photo version is a JPEG (a full-bleed photo as PNG is huge); plain and
// sticker stay PNG, the sticker needs its see-through background.
export async function prepareCard(summary, opts, fileName) {
  try {
    // Canvas won't pull web fonts by itself: wait (briefly) for ours.
    await waitForFonts()
  } catch {
    /* fonts are optional: the fallback stack still draws a fine card */
  }
  const canvas = renderShareCard(summary, opts)
  const jpeg = opts.variant === 'photo' && opts.photo
  const type = jpeg ? 'image/jpeg' : 'image/png'
  const blob = await toBlob(canvas, type, jpeg ? 0.9 : undefined)
  if (!blob) throw new Error('NO_IMAGE')
  return new File([blob], fileName, { type: blob.type || type })
}

export function downloadFile(file) {
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

// iPhone and iPad (newer iPads call themselves Macs but have a touch screen).
// A downloaded picture lands in the Files app there, not in Photos, so Save
// uses the share sheet instead, whose "Save Image" puts it in Photos.
export const isIOS = () =>
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

// Can this browser put a picture on the clipboard? (Not Firefox, for one.)
export const canCopyImage = () =>
  typeof window !== 'undefined' && typeof window.ClipboardItem !== 'undefined' && !!navigator.clipboard?.write

// Must be called straight from the tap, with a file that is already made.
export async function copyImage(file) {
  await navigator.clipboard.write([new window.ClipboardItem({ [file.type]: file })])
}

// Call straight from the tap. Returns 'shared', 'downloaded' or 'cancelled'.
export async function shareFile(file, { text, title }) {
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text, title })
      return 'shared'
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled'
      throw err
    }
  }
  downloadFile(file)
  return 'downloaded'
}
