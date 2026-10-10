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
// Colours come from the app's Tailwind theme. The poster fonts are our own
// copies under public/fonts/share, loaded only when the workout screen opens
// so the rest of the app doesn't get heavier. Cards are a 1080 x 1920
// Instagram story; everything stays between y=250 and y=1670 because
// Instagram puts its own buttons at the top and bottom. Photos are only ever
// drawn on this phone.
import tailwind from '../../tailwind.config.js'

const W = 1080
const H = 1920
const M = 96 // side margin
const T = tailwind.theme.extend.colors
const C = { ink: T.ink, chalk: T.chalk, dim: T.chalkdim, brass: T.brass, line: T.line }
const GOLD = '#F0CF7A' // lighter than the app's brass so it still reads on pale photos

// Numbers are always the tall condensed face (the same Barlow Condensed the
// app uses for headings); English words use it too, Hebrew words use
// Karantina (same proportions, real Hebrew letters). The families carry an
// "IL " prefix so the card never depends on the app's own font stylesheet.
const NUM = '"IL Barlow Condensed", "Barlow Condensed", sans-serif'
const HEB_DISPLAY = '"IL Karantina", "Rubik", sans-serif'
const LBL_EN = '"IL Inter", Inter, system-ui, sans-serif'
const LBL_HE = '"IL Heebo", Heebo, "Rubik", system-ui, sans-serif'

// Self-hosted woff2 files (Google Fonts latin / hebrew subsets). Heebo and
// Inter are variable fonts, so one file covers both weights.
const LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD'
const HEBREW = 'U+0307-0308, U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F'
const FACES = [
  ['IL Barlow Condensed', 'barlow-condensed-latin', '800', LATIN],
  ['IL Karantina', 'karantina-latin', '700', LATIN],
  ['IL Karantina', 'karantina-hebrew', '700', HEBREW],
  ['IL Heebo', 'heebo-latin', '600 700', LATIN],
  ['IL Heebo', 'heebo-hebrew', '600 700', HEBREW],
  ['IL Inter', 'inter-latin', '600 700', LATIN],
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
    ctx.lineWidth = Math.max(3, fontPx(ctx) * 0.06)
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'
    setShadow(ctx, 'rgba(0,0,0,0.45)', 24)
    ctx.strokeText(text, x, y)
  } else {
    if (FX?.shadow) setShadow(ctx, FX.shadow.color, FX.shadow.blur, FX.shadow.y)
    ctx.fillText(text, x, y)
  }
  ctx.restore()
}

// A filled bar; on the sticker it gets the same dark outline as the text.
function bar(ctx, x, y, w, h, color) {
  ctx.save()
  if (FX?.sticker && PASS === 'stroke') {
    ctx.lineJoin = 'round'
    ctx.lineWidth = 6
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'
    setShadow(ctx, 'rgba(0,0,0,0.45)', 24)
    ctx.strokeRect(x, y, w, h)
  } else {
    if (FX?.sticker) setShadow(ctx, FX.shadow.color, FX.shadow.blur, FX.shadow.y)
    ctx.fillStyle = color
    ctx.fillRect(x, y, w, h)
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

// Letter-spaced text (ctx.letterSpacing isn't in older Safari). Only used
// for Latin capitals, never Hebrew.
function tracked(ctx, text, x, y, spacing, align) {
  const chars = [...text]
  const widths = chars.map((c) => ctx.measureText(c).width)
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1)
  let cx = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x
  const prev = ctx.textAlign
  ctx.textAlign = 'left'
  chars.forEach((c, i) => {
    put(ctx, c, cx, y)
    cx += widths[i] + spacing
  })
  ctx.textAlign = prev
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

// Letter-spaced width, matching tracked().
function trackedWidth(ctx, text, spacing) {
  const chars = [...text]
  return chars.reduce((a, c) => a + ctx.measureText(c).width, 0) + spacing * Math.max(0, chars.length - 1)
}

// A small caption in the label font: tracked capitals in English, plain
// text in Hebrew. `x` is the edge on the reading-start side (or the end side
// when `end` is set); long captions are cut with an ellipsis to fit `maxW`.
function drawLabel(ctx, text, x, y, { rtl, size, weight = 600, color, spacing, maxW = W, end = false }) {
  ctx.fillStyle = color
  ctx.font = `${weight} ${size}px ${rtl ? LBL_HE : LBL_EN}`
  ctx.direction = rtl ? 'rtl' : 'ltr'
  if (rtl) {
    ctx.textAlign = end ? 'left' : 'right'
    put(ctx, fit(ctx, text, maxW), x, y)
    return
  }
  let t = text.toUpperCase()
  while (t.length > 1 && trackedWidth(ctx, t, spacing) > maxW) t = t.slice(0, -2) + '…'
  tracked(ctx, t, x, y, spacing, end ? 'right' : 'left')
}

// A stat's unit: Hebrew units use Karantina, everything else the English
// capitals (Karantina has no Latin lowercase).
function unitFace(unit) {
  const heb = isHeb(unit)
  return { text: heb ? unit : unit.toUpperCase(), font: (px) => `${heb ? 700 : 800} ${px}px ${heb ? HEB_DISPLAY : NUM}` }
}

// Width of "value + gap + unit" with the value at `size` px.
function valueWidth(ctx, st, size, unitPx, gap, valueWeight) {
  ctx.font = `${valueWeight} ${size}px ${NUM}`
  const vw = ctx.measureText(st.value).width
  if (!st.unit) return vw
  const u = unitFace(st.unit)
  ctx.font = u.font(unitPx)
  return vw + gap + ctx.measureText(u.text).width
}

// Biggest size (from `max` down to `min`) at which value + unit fit `maxW`;
// the unit scales with it. If even the smallest doesn't fit, the number is
// cut with an ellipsis.
function fitStat(ctx, st, { max, min, unit, gap, weight, maxW }) {
  const unitAt = (s) => Math.round((s * unit) / max)
  let size = max
  while (size > min && valueWidth(ctx, st, size, unitAt(size), gap, weight) > maxW) size -= 4
  let out = st
  if (valueWidth(ctx, st, size, unitAt(size), gap, weight) > maxW) {
    let v = st.value
    while (v.length > 1 && valueWidth(ctx, { ...st, value: `${v}…` }, size, unitAt(size), gap, weight) > maxW) v = v.slice(0, -1)
    out = { ...st, value: `${v}…` }
  }
  return { st: out, size, unitPx: unitAt(size), width: valueWidth(ctx, out, size, unitAt(size), gap, weight) }
}

// Value with its unit right after it (on the end side). Left to right the
// value starts at x; in Hebrew it starts at x and the unit sits to its left.
function drawValue(ctx, st, x, y, { rtl, size, unitPx, gap, valueWeight, color, unitColor }) {
  ctx.direction = 'ltr'
  ctx.textAlign = rtl ? 'right' : 'left'
  ctx.fillStyle = color
  ctx.font = `${valueWeight} ${size}px ${NUM}`
  put(ctx, st.value, x, y)
  if (!st.unit) return
  const vw = ctx.measureText(st.value).width
  const u = unitFace(st.unit)
  ctx.fillStyle = unitColor
  ctx.font = u.font(unitPx)
  ctx.direction = isHeb(st.unit) ? 'rtl' : 'ltr'
  put(ctx, u.text, rtl ? x - vw - gap : x + vw + gap, y)
}

// Workout name at a fixed size: its face follows the letters in it, not the
// screen's language (Barlow has no Hebrew, Karantina has no Latin
// lowercase). Long names wrap at spaces onto at most two lines; whatever
// still doesn't fit on line two is cut with an ellipsis.
function layoutName(ctx, summary, { maxEn, maxHe }) {
  const heb = isHeb(summary.routineName)
  const text = heb ? summary.routineName : summary.routineName.toUpperCase()
  const size = heb ? maxHe : maxEn
  const family = heb ? HEB_DISPLAY : NUM
  const weight = heb ? 700 : 800
  ctx.font = `${weight} ${size}px ${family}`
  ctx.direction = isHeb(text) ? 'rtl' : 'ltr'
  const maxW = W - M * 2
  const words = text.trim().split(/\s+/)
  let line1 = ''
  let i = 0
  while (i < words.length) {
    const next = line1 ? `${line1} ${words[i]}` : words[i]
    if (ctx.measureText(next).width > maxW && line1) break
    line1 = next
    i++
  }
  let lines
  if (ctx.measureText(line1).width > maxW) {
    // a single word wider than the card: cut it and show the rest below
    lines = [fit(ctx, line1, maxW)]
    if (i < words.length) lines.push(fitWords(ctx, words.slice(i).join(' '), maxW))
  } else {
    lines = [line1]
    if (i < words.length) lines.push(fitWords(ctx, words.slice(i).join(' '), maxW))
  }
  return { lines, size, family, weight, lh: Math.round(size * (heb ? 1 : 0.96)) }
}

function drawName(ctx, nm, x, y, { rtl, color }) {
  ctx.font = `${nm.weight} ${nm.size}px ${nm.family}`
  ctx.fillStyle = color
  ctx.direction = rtl ? 'rtl' : 'ltr'
  ctx.textAlign = rtl ? 'right' : 'left'
  nm.lines.forEach((ln, i) => put(ctx, ln, x, y + i * nm.lh))
}

function drawBrand(ctx, x, y, { rtl, color }) {
  ctx.direction = 'ltr'
  ctx.fillStyle = color
  ctx.font = `800 34px ${NUM}`
  tracked(ctx, 'IRONLOG', x, y, 10, rtl ? 'right' : 'left')
}

// Name, brass rule, the hero stat on its own line, then time and streak side
// by side underneath. Used for both the photo picture and the sticker so
// they are one design. Anchored by the name's first baseline (`top`) or by
// the bottom of the numbers (`bottom`); a two-line name grows away from the
// anchor. Returns the baseline of the last row.
function drawOverlayBlock(ctx, summary, { rtl, labels, top, bottom, accent, labelColor }) {
  const x0 = rtl ? W - M : M
  const full = W - M * 2
  const { hero, small } = pickStats(summary, labels)
  const nm = layoutName(ctx, summary, { maxEn: 88, maxHe: 110 })
  const extra = (nm.lines.length - 1) * nm.lh
  const heroLabelOff = 112
  const heroValueOff = heroLabelOff + 148
  const smallLabelOff = heroValueOff + 90
  const smallValueOff = smallLabelOff + 82
  const rel = small.length ? smallValueOff : heroValueOff
  const base = top != null ? top : bottom - rel - extra // first baseline of the name
  const last = base + extra // last baseline of the name

  const heroFit = fitStat(ctx, hero, { max: 170, min: 110, unit: 60, gap: 14, weight: 800, maxW: full })
  const half = full / 2
  const smallFits = small.slice(0, 2).map((st) => fitStat(ctx, st, { max: 90, min: 60, unit: 36, gap: 10, weight: 800, maxW: half - 24 }))

  passes(() => {
    drawName(ctx, nm, x0, base, { rtl, color: '#FFFFFF' })
    bar(ctx, rtl ? W - M - 56 : M, last + 32, 56, 5, accent)
    drawLabel(ctx, hero.label, x0, last + heroLabelOff, { rtl, size: 26, color: labelColor, spacing: 5, maxW: full })
    drawValue(ctx, heroFit.st, x0, last + heroValueOff, { rtl, size: heroFit.size, unitPx: heroFit.unitPx, gap: 14, valueWeight: 800, color: '#FFFFFF', unitColor: accent })
    smallFits.forEach((f, i) => {
      const x = rtl ? W - M - i * half : M + i * half
      drawLabel(ctx, f.st.label, x, last + smallLabelOff, { rtl, size: 24, color: labelColor, spacing: 4, maxW: half - 24 })
      drawValue(ctx, f.st, x, last + smallValueOff, { rtl, size: f.size, unitPx: f.unitPx, gap: 10, valueWeight: 800, color: '#FFFFFF', unitColor: accent })
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

// Soft darkening at the top and bottom only, so the middle of the photo stays
// as it was and white text stays readable on bright photos. The bottom one
// starts higher than the numbers block, which is now taller.
function drawScrims(ctx) {
  const top = ctx.createLinearGradient(0, 0, 0, 420)
  top.addColorStop(0, 'rgba(10,11,13,0.45)')
  top.addColorStop(1, 'rgba(10,11,13,0)')
  ctx.fillStyle = top
  ctx.fillRect(0, 0, W, 420)
  const y0 = 820
  const bot = ctx.createLinearGradient(0, y0, 0, H)
  bot.addColorStop(0, 'rgba(10,11,13,0)')
  bot.addColorStop(0.4, 'rgba(10,11,13,0.55)') // y = 1288
  bot.addColorStop(1, 'rgba(10,11,13,0.88)')
  ctx.fillStyle = bot
  ctx.fillRect(0, y0, W, H - y0)
}

function drawPlain(ctx, summary, { rtl, labels }) {
  const x0 = rtl ? W - M : M
  const xEnd = rtl ? M : W - M
  ctx.fillStyle = C.ink
  ctx.fillRect(0, 0, W, H)
  // a faint warm light from the top end corner
  const gx = rtl ? 0 : W
  const glow = ctx.createRadialGradient(gx, 0, 0, gx, 0, 1300)
  glow.addColorStop(0, 'rgba(201,162,75,0.16)')
  glow.addColorStop(1, 'rgba(201,162,75,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)
  ctx.textBaseline = 'alphabetic'

  // brand row
  drawBrand(ctx, x0, 310, { rtl, color: C.brass })
  drawLabel(ctx, labels.eyebrow || '', xEnd, 310, { rtl, size: 26, color: C.dim, spacing: 5, end: true })

  const { hero, small, heroKey } = pickStats(summary, labels)
  const heroLabel = heroKey === 'volume' && labels.totalVolume ? labels.totalVolume : hero.label
  const nm = layoutName(ctx, summary, { maxEn: 120, maxHe: 150 })
  const full = W - M * 2
  const half = full / 2
  // the big number: sized so the value and its unit fit the width together
  const heroFit = fitStat(ctx, hero, { max: 300, min: 160, unit: 96, gap: 20, weight: 800, maxW: full })
  const smallFits = small.slice(0, 2).map((st) => fitStat(ctx, st, { max: 170, min: 90, unit: 60, gap: 14, weight: 800, maxW: half - 40 }))

  // Positions relative to the name's first baseline, then the whole block is
  // centred in the story's safe area (y 250-1670).
  const last = (nm.lines.length - 1) * nm.lh
  const ruleY = last + 40
  const heroLabelY = ruleY + 90
  const heroValueY = heroLabelY + 38 + Math.round(heroFit.size * 0.7)
  const divY = heroValueY + 70
  const smallLabelY = divY + 80
  const smallValueY = smallLabelY + 36 + 119
  const bottom = small.length ? smallValueY : heroValueY
  const blockTop = -Math.round(nm.size * 0.74)
  const dy = Math.max(Math.round(960 - (blockTop + bottom) / 2), 400 - blockTop)

  drawName(ctx, nm, x0, dy, { rtl, color: C.chalk })
  bar(ctx, rtl ? W - M - 64 : M, ruleY + dy, 64, 6, C.brass)
  drawLabel(ctx, heroLabel, x0, heroLabelY + dy, { rtl, size: 30, color: C.dim, spacing: 6, maxW: full })
  drawValue(ctx, heroFit.st, x0, heroValueY + dy, { rtl, size: heroFit.size, unitPx: heroFit.unitPx, gap: 20, valueWeight: 800, color: C.chalk, unitColor: C.brass })

  if (small.length) {
    ctx.fillStyle = C.line
    ctx.fillRect(M, divY + dy, full, 2)
    smallFits.forEach((f, i) => {
      const last2 = i === 1 // the second stat hangs off the end margin
      const x = last2 ? xEnd : rtl ? W - M : M
      drawLabel(ctx, f.st.label, x, smallLabelY + dy, { rtl, size: 28, color: C.dim, spacing: 5, maxW: half - 40, end: last2 })
      const vx = last2 ? (rtl ? M + f.width : W - M - f.width) : x
      drawValue(ctx, f.st, vx, smallValueY + dy, { rtl, size: f.size, unitPx: f.unitPx, gap: 14, valueWeight: 800, color: C.chalk, unitColor: C.brass })
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
      // white, not brass: the top of a photo is often bright sky or gym lights
      FX = { shadow: { color: 'rgba(0,0,0,0.5)', blur: 12, y: 0 } }
      passes(() => drawBrand(ctx, rtl ? W - M : M, 310, { rtl, color: 'rgba(255,255,255,0.95)' }))
      FX = { shadow: { color: 'rgba(0,0,0,0.35)', blur: 12, y: 2 } }
      drawOverlayBlock(ctx, summary, { rtl, labels, bottom: 1640, accent: GOLD, labelColor: 'rgba(255,255,255,0.78)' })
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
  const bottom = drawOverlayBlock(sctx, summary, { rtl, labels, top: 200, accent: GOLD, labelColor: '#FFFFFF' })
  passes(() => drawBrand(sctx, rtl ? W - M : M, bottom + 84, { rtl, color: GOLD }))

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
