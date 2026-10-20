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
const WHITE_DIM = 'rgba(255,255,255,0.74)' // labels and units over a photo

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
  fontsPromise = Promise.all(
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
  ).then((r) => (fontsDone = r.every(Boolean)))
  return fontsPromise
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
    ctx.lineJoin = 'round'
    ctx.lineWidth = Math.max(3, fontPx(ctx) * 0.045)
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'
    setShadow(ctx, 'rgba(0,0,0,0.45)', 24)
    ctx.strokeText(text, x, y)
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

// The big number and the small ones. Hero: volume lifted, else cardio
// distance, else duration, else set count. Small: duration and streak.
function pickStats(summary, labels) {
  const duration = summary.durationMinutes || (summary.cardioMinutes > 0 ? summary.cardioMinutes : null)
  const dist = summary.cardioDistance != null ? Math.round(summary.cardioDistance * 100) / 100 : null
  const stats = {
    volume: summary.volume > 0 && { label: labels.volume, value: summary.volume.toLocaleString('en-US'), unit: summary.volumeUnit },
    distance: dist > 0 && { label: labels.distance, value: String(dist), unit: summary.cardioUnit },
    duration: duration && { label: labels.duration, value: String(duration), unit: labels.min },
    sets: { label: labels.sets, value: String(summary.setCount), unit: '' },
    streak: summary.streakWeeks > 0 && { label: labels.streak, value: String(summary.streakWeeks), unit: labels.weekUnit },
  }
  const heroKey = ['volume', 'distance', 'duration', 'sets'].find((k) => stats[k])
  const small = ['duration', 'streak'].filter((k) => k !== heroKey && stats[k]).map((k) => stats[k])
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

// Value with its unit right after it (on the end side), the unit smaller and
// quieter so the number carries the card. Left to right the value starts at
// x; in Hebrew it starts at x and the unit sits to its left.
function drawValue(ctx, f, x, y, { rtl, gap, color, unitColor }) {
  const { st, size, unitPx } = f
  ctx.direction = 'ltr'
  ctx.textAlign = rtl ? 'right' : 'left'
  ctx.fillStyle = color
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

// Workout name in sentence case, as the trainee typed it. Long names wrap at
// spaces onto at most two lines (stepping down to 80% first); whatever still
// doesn't fit on line two is cut with an ellipsis.
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
  return { lines, size, lh: Math.round(size * 1.08) }
}

function drawName(ctx, nm, x, y, { rtl, color }) {
  setFont(ctx, 600, nm.size, -0.03)
  ctx.fillStyle = color
  ctx.direction = rtl ? 'rtl' : 'ltr'
  ctx.textAlign = rtl ? 'right' : 'left'
  nm.lines.forEach((ln, i) => put(ctx, ln, x, y + i * nm.lh))
}

// The wordmark, set like the app's own header: sentence case, tight.
function drawBrand(ctx, x, y, { rtl, color, size = 40 }) {
  ctx.direction = 'ltr'
  ctx.textAlign = rtl ? 'right' : 'left'
  ctx.fillStyle = color
  setFont(ctx, 600, size, -0.03)
  put(ctx, 'Ironlog', x, y)
}

// Name, the hero stat, then time and streak side by side underneath. Used
// for both the photo picture and the sticker so they are one design.
// Anchored by the name's first baseline (`top`) or by the bottom of the
// numbers (`bottom`); a two-line name grows away from the anchor. Returns
// the baseline of the last row.
function drawOverlayBlock(ctx, summary, { rtl, labels, top, bottom, labelColor }) {
  const x0 = rtl ? W - M : M
  const full = W - M * 2
  const half = full / 2
  const { hero, small } = pickStats(summary, labels)
  const nm = layoutName(ctx, summary, { size: 76 })
  const extra = (nm.lines.length - 1) * nm.lh
  const heroLabelOff = 100
  const heroValueOff = heroLabelOff + 150
  const smallLabelOff = heroValueOff + 96
  const smallValueOff = smallLabelOff + 88
  const rel = small.length ? smallValueOff : heroValueOff
  const base = top != null ? top : bottom - rel - extra // first baseline of the name
  const last = base + extra // last baseline of the name

  const heroFit = fitStat(ctx, hero, { max: 170, min: 110, unit: 50, gap: 12, maxW: full })
  const smallFits = small.slice(0, 2).map((st) => fitStat(ctx, st, { max: 84, min: 56, unit: 30, gap: 8, maxW: half - 24 }))

  passes(() => {
    drawName(ctx, nm, x0, base, { rtl, color: '#FFFFFF' })
    drawLabel(ctx, hero.label, x0, last + heroLabelOff, { rtl, size: 30, color: labelColor, maxW: full })
    drawValue(ctx, heroFit, x0, last + heroValueOff, { rtl, gap: 12, color: '#FFFFFF', unitColor: labelColor })
    smallFits.forEach((f, i) => {
      const x = rtl ? W - M - i * half : M + i * half
      drawLabel(ctx, f.st.label, x, last + smallLabelOff, { rtl, size: 28, color: labelColor, maxW: half - 24 })
      drawValue(ctx, f, x, last + smallValueOff, { rtl, gap: 8, color: '#FFFFFF', unitColor: labelColor })
    })
  })
  return last + rel
}

// Fill-and-crop a photo to cover the whole story.
function drawPhoto(ctx, photo) {
  const scale = Math.max(W / photo.width, H / photo.height)
  const dw = photo.width * scale
  const dh = photo.height * scale
  ctx.drawImage(photo.source, (W - dw) / 2, (H - dh) / 2, dw, dh)
}

// Light touch: the photo is the point. A faint top fade for the wordmark,
// and a bottom fade that only starts below the middle and eases in, so a
// face or body in the frame stays bright. Below ~1670 Instagram covers the
// picture with its own controls, so it never needs to go near black.
function drawScrims(ctx) {
  const top = ctx.createLinearGradient(0, 0, 0, 380)
  top.addColorStop(0, 'rgba(11,11,12,0.32)')
  top.addColorStop(1, 'rgba(11,11,12,0)')
  ctx.fillStyle = top
  ctx.fillRect(0, 0, W, 380)
  const y0 = 960
  const bot = ctx.createLinearGradient(0, y0, 0, H)
  const at = (y, a) => bot.addColorStop((y - y0) / (H - y0), `rgba(11,11,12,${a})`)
  at(960, 0)
  at(1100, 0.16)
  at(1240, 0.4)
  at(1400, 0.58)
  at(1700, 0.68)
  at(H, 0.72)
  ctx.fillStyle = bot
  ctx.fillRect(0, y0, W, H - y0)
}

// The plain card: the app's dark surface, one quiet wordmark, and the
// numbers doing the talking. The accent appears once, as the small
// "complete" dot.
function drawPlain(ctx, summary, { rtl, labels }) {
  const x0 = rtl ? W - M : M
  const xEnd = rtl ? M : W - M
  const full = W - M * 2
  const half = full / 2
  ctx.fillStyle = C.ink
  ctx.fillRect(0, 0, W, H)
  // a barely-there lift at the top, so the card has depth without a colour
  const lift = ctx.createRadialGradient(W / 2, -200, 0, W / 2, -200, 1400)
  lift.addColorStop(0, 'rgba(255,255,255,0.06)')
  lift.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = lift
  ctx.fillRect(0, 0, W, H)
  ctx.textBaseline = 'alphabetic'

  // top row: wordmark at the start, "• Workout complete" at the end
  drawBrand(ctx, x0, 320, { rtl, color: C.chalk })
  const lw = drawLabel(ctx, labels.eyebrow || '', xEnd, 320, { rtl, size: 30, color: C.dim, end: true, maxW: half })
  if (labels.eyebrow) {
    ctx.fillStyle = C.accent
    ctx.beginPath()
    ctx.arc(rtl ? M + lw + 22 : W - M - lw - 22, 310, 7, 0, Math.PI * 2)
    ctx.fill()
  }

  const { hero, small, heroKey } = pickStats(summary, labels)
  const heroLabel = heroKey === 'volume' && labels.totalVolume ? labels.totalVolume : hero.label
  const nm = layoutName(ctx, summary, { size: 92 })
  // the big number: sized so the value and its unit fit the width together
  const heroFit = fitStat(ctx, hero, { max: 280, min: 160, unit: 76, gap: 18, maxW: full })
  const smallFits = small.slice(0, 2).map((st) => fitStat(ctx, st, { max: 120, min: 80, unit: 40, gap: 10, maxW: half - 40 }))
  const smallSize = Math.max(0, ...smallFits.map((f) => f.size))

  // Positions relative to the name's first baseline, then the whole block is
  // centred in the story's safe area (y 250-1670).
  const last = (nm.lines.length - 1) * nm.lh
  const heroLabelY = last + 150
  const heroValueY = heroLabelY + 28 + Math.round(heroFit.size * 0.72)
  const divY = heroValueY + 84
  const smallLabelY = divY + 92
  const smallValueY = smallLabelY + 24 + Math.round(smallSize * 0.72)
  const bottom = small.length ? smallValueY : heroValueY
  const blockTop = -Math.round(nm.size * 0.74)
  // centred a little below the safe area's middle: the top row already
  // weighs on the top
  const dy = Math.max(Math.round(1000 - (blockTop + bottom) / 2), 440 - blockTop)

  drawName(ctx, nm, x0, dy, { rtl, color: C.chalk })
  drawLabel(ctx, heroLabel, x0, heroLabelY + dy, { rtl, size: 32, color: C.dim, maxW: full })
  drawValue(ctx, heroFit, x0, heroValueY + dy, { rtl, gap: 18, color: C.chalk, unitColor: C.dim })

  if (small.length) {
    ctx.fillStyle = C.line
    ctx.fillRect(M, divY + dy, full, 2)
    smallFits.forEach((f, i) => {
      const x = rtl ? W - M - i * half : M + i * half
      drawLabel(ctx, f.st.label, x, smallLabelY + dy, { rtl, size: 30, color: C.dim, maxW: half - 40 })
      drawValue(ctx, f, x, smallValueY + dy, { rtl, gap: 10, color: C.chalk, unitColor: C.dim })
    })
  }
}

// variant: 'plain' (default), 'photo' (needs `photo`) or 'sticker'.
// labels: { eyebrow, totalVolume, duration, volume, distance, sets, streak, weekUnit, min }
export function renderShareCard(summary, { rtl, labels, variant = 'plain', photo = null }) {
  const canvas = document.createElement('canvas')
  canvas.width = W
  const ctx = canvas.getContext('2d')
  ctx.textBaseline = 'alphabetic'
  try {
    if (variant === 'sticker') return renderSticker(summary, { rtl, labels })
    canvas.height = H
    if (variant === 'photo' && photo) {
      drawPhoto(ctx, photo)
      drawScrims(ctx)
      // white only: the accent can clash with whatever colours the photo has
      FX = { shadow: { color: 'rgba(0,0,0,0.45)', blur: 12, y: 0 } }
      passes(() => drawBrand(ctx, rtl ? W - M : M, 320, { rtl, color: 'rgba(255,255,255,0.95)' }))
      FX = { shadow: { color: 'rgba(0,0,0,0.35)', blur: 12, y: 2 } }
      drawOverlayBlock(ctx, summary, { rtl, labels, bottom: 1640, labelColor: WHITE_DIM })
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
  scratch.height = 1100
  const sctx = scratch.getContext('2d', { willReadFrequently: true })
  sctx.textBaseline = 'alphabetic'
  FX = { sticker: true, shadow: { color: 'rgba(0,0,0,0.6)', blur: 4, y: 0 } }
  // labels stay full white here: the sticker can land on anything
  const bottom = drawOverlayBlock(sctx, summary, { rtl, labels, top: 200, labelColor: 'rgba(255,255,255,0.9)' })
  passes(() => drawBrand(sctx, rtl ? W - M : M, bottom + 96, { rtl, color: '#FFFFFF', size: 36 }))

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
