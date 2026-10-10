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
// own photo, and a see-through sticker (the photo look without the photo). Colours come from the
// app's Tailwind theme. The poster fonts are loaded only when this screen
// opens, so the rest of the app doesn't get heavier. Cards are a 1080 x 1920
// Instagram story; everything stays between y=250 and y=1670 because
// Instagram puts its own buttons at the top and bottom. Photos are only ever drawn on this phone.
import tailwind from '../../tailwind.config.js'

const W = 1080
const H = 1920
const M = 96 // side margin
const T = tailwind.theme.extend.colors
const C = { ink: T.ink, chalk: T.chalk, dim: T.chalkdim, brass: T.brass, line: T.line }

// Numbers are always the tall condensed face; English words use it too,
// Hebrew words use Karantina (same proportions, real Hebrew letters).
const NUM = '"Big Shoulders Display", "Barlow Condensed", sans-serif'
const HEB_DISPLAY = '"Karantina", "Rubik", sans-serif'
const LBL_EN = '"Inter", system-ui, sans-serif'
const LBL_HE = '"Heebo", "Rubik", system-ui, sans-serif'
const FONT_CSS =
  'https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@800;900&family=Karantina:wght@700&family=Heebo:wght@600;700&display=swap'
// Everything the card draws with. Hebrew sample text makes the Hebrew pieces
// of each font download too.
const FONT_REQUESTS = [
  `800 100px ${NUM}`,
  `900 100px ${NUM}`,
  `700 100px ${HEB_DISPLAY}`,
  `700 30px ${LBL_EN}`,
  `600 30px ${LBL_EN}`,
  `600 30px ${LBL_HE}`,
  `700 30px ${LBL_HE}`,
]

// The stylesheet is added once, and everyone waits on the same promise. It
// settles when the stylesheet loads, fails, or 3 seconds pass, so a slow or
// blocked Google Fonts can never hold up the Share buttons.
const FONT_WAIT_MS = 3000
let fontSheet = null
function addFontStylesheet() {
  if (fontSheet || typeof document === 'undefined') return fontSheet || Promise.resolve()
  fontSheet = new Promise((resolve) => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = FONT_CSS
    link.onload = resolve
    link.onerror = resolve
    document.head.appendChild(link)
    setTimeout(resolve, FONT_WAIT_MS)
  })
  return fontSheet
}

// Google splits each font by script, so a font only downloads the part that
// covers the text it's asked about: ask with the Latin and Hebrew sample
// text plus whatever the card is about to draw.
const SAMPLE = 'Aa 0123456789,. אבגדהוזחטיכלמנסעפצקרשת״׳'
async function loadFonts(extraText = '') {
  await addFontStylesheet()
  const text = `${SAMPLE} ${extraText}`
  const loads = Promise.all(FONT_REQUESTS.map((f) => document.fonts.load(f, text)))
  await Promise.race([loads, new Promise((resolve) => setTimeout(resolve, FONT_WAIT_MS))])
}

// Called when the workout screen opens, so the fonts are already on the phone
// by the time the workout is finished.
export function preloadShareFonts() {
  loadFonts().catch(() => {})
}

function fit(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1)
  return `${t}…`
}

// Largest font size (down to `min`) at which the text fits `maxW`.
function fitSize(ctx, text, weight, family, max, min, maxW) {
  let s = max
  ctx.font = `${weight} ${s}px ${family}`
  while (s > min && ctx.measureText(text).width > maxW) {
    s -= 6
    ctx.font = `${weight} ${s}px ${family}`
  }
  return s
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
    ctx.fillText(c, cx, y)
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
    ctx.fillText(fit(ctx, text, maxW), x, y)
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

// Value with its unit right after it (on the end side). Left to right the
// value starts at x; in Hebrew it starts at x and the unit sits to its left.
function drawValue(ctx, st, x, y, { rtl, size, unitPx, gap, valueWeight, color, unitColor }) {
  ctx.direction = 'ltr'
  ctx.textAlign = rtl ? 'right' : 'left'
  ctx.fillStyle = color
  ctx.font = `${valueWeight} ${size}px ${NUM}`
  ctx.fillText(st.value, x, y)
  if (!st.unit) return
  const vw = ctx.measureText(st.value).width
  const u = unitFace(st.unit)
  ctx.fillStyle = unitColor
  ctx.font = u.font(unitPx)
  ctx.direction = isHeb(st.unit) ? 'rtl' : 'ltr'
  ctx.fillText(u.text, rtl ? x - vw - gap : x + vw + gap, y)
}

// Workout name: its face follows the letters in it, not the screen's
// language (Big Shoulders has no Hebrew, Karantina has no Latin lowercase).
function drawName(ctx, summary, x, y, { rtl, maxEn, maxHe, min, color }) {
  const heb = isHeb(summary.routineName)
  const name = heb ? summary.routineName : summary.routineName.toUpperCase()
  const family = heb ? HEB_DISPLAY : NUM
  const weight = heb ? 700 : 800
  fitSize(ctx, name, weight, family, heb ? maxHe : maxEn, min, W - M * 2)
  ctx.fillStyle = color
  ctx.direction = rtl ? 'rtl' : 'ltr'
  ctx.textAlign = rtl ? 'right' : 'left'
  ctx.fillText(fit(ctx, name, W - M * 2), x, y)
}

function setShadow(ctx, color, blur, offsetY = 0) {
  ctx.shadowColor = color || 'transparent'
  ctx.shadowBlur = color ? blur : 0
  ctx.shadowOffsetY = color ? offsetY : 0
}

function drawBrand(ctx, x, y, { rtl, color }) {
  ctx.direction = 'ltr'
  ctx.fillStyle = color
  ctx.font = `800 34px ${NUM}`
  tracked(ctx, 'IRONLOG', x, y, 10, rtl ? 'right' : 'left')
}

// Name, brass rule and a row of up to three stats in equal columns. Used
// for both the photo picture and the sticker so they are one design. `top`
// is the name's baseline; everything else hangs off it.
function drawOverlayBlock(ctx, summary, { rtl, labels, top, shadow, accent }) {
  const x0 = rtl ? W - M : M
  const { hero, small } = pickStats(summary, labels)
  const stats = [hero, ...small].slice(0, 3)
  const nameY = top
  const ruleY = top + 32
  const labelY = top + 120
  const valueY = top + 260
  const sepTop = top + 90
  const sepBot = top + 270

  setShadow(ctx, shadow.color, shadow.blur, 2)
  drawName(ctx, summary, x0, nameY, { rtl, maxEn: 88, maxHe: 110, min: 56, color: '#FFFFFF' })
  setShadow(ctx, null)
  ctx.fillStyle = accent
  ctx.fillRect(rtl ? W - M - 56 : M, ruleY, 56, 5)

  const n = stats.length
  const colW = (W - M * 2) / n
  const PAD = 28
  const GAP = 10
  const UNIT = 46
  const room = (i) => colW - (i > 0 ? PAD : 0) - 34
  // one value size for the whole row, so the numbers line up
  let size = 124
  while (size > 70 && stats.some((st, i) => valueWidth(ctx, st, size, UNIT, GAP, 800) > room(i))) size -= 4

  setShadow(ctx, shadow.color, shadow.blur, 2)
  stats.forEach((st, i) => {
    const edge = rtl ? W - M - i * colW : M + i * colW
    const x = edge + (rtl ? -1 : 1) * (i > 0 ? PAD : 0)
    drawLabel(ctx, st.label, x, labelY, { rtl, size: 26, color: 'rgba(255,255,255,0.78)', spacing: 4, maxW: room(i) })
    drawValue(ctx, st, x, valueY, { rtl, size, unitPx: UNIT, gap: GAP, valueWeight: 800, color: '#FFFFFF', unitColor: accent })
  })
  setShadow(ctx, null)
  ctx.fillStyle = 'rgba(255,255,255,0.28)'
  for (let i = 1; i < n; i++) ctx.fillRect(M + i * colW - 1, sepTop, 2, sepBot - sepTop)
  return valueY
}

// Fill-and-crop a photo to cover the whole story.
function drawPhoto(ctx, photo) {
  const scale = Math.max(W / photo.width, H / photo.height)
  const dw = photo.width * scale
  const dh = photo.height * scale
  ctx.drawImage(photo.source, (W - dw) / 2, (H - dh) / 2, dw, dh)
}

// Soft darkening at the top and bottom only, so the middle of the photo stays
// as it was and white text stays readable on bright photos.
function drawScrims(ctx) {
  const top = ctx.createLinearGradient(0, 0, 0, 420)
  top.addColorStop(0, 'rgba(10,11,13,0.45)')
  top.addColorStop(1, 'rgba(10,11,13,0)')
  ctx.fillStyle = top
  ctx.fillRect(0, 0, W, 420)
  const bot = ctx.createLinearGradient(0, H * 0.48, 0, H)
  bot.addColorStop(0, 'rgba(10,11,13,0)')
  bot.addColorStop(0.46, 'rgba(10,11,13,0.55)') // y = H * 0.72
  bot.addColorStop(1, 'rgba(10,11,13,0.88)')
  ctx.fillStyle = bot
  ctx.fillRect(0, H * 0.48, W, H - H * 0.48)
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

  drawName(ctx, summary, x0, 560, { rtl, maxEn: 120, maxHe: 150, min: 64, color: C.chalk })
  ctx.fillStyle = C.brass
  ctx.fillRect(rtl ? W - M - 64 : M, 600, 64, 6)

  // the big number: sized so the value and its unit fit the width together
  const { hero, small, heroKey } = pickStats(summary, labels)
  const heroLabel = heroKey === 'volume' && labels.totalVolume ? labels.totalVolume : hero.label
  drawLabel(ctx, heroLabel, x0, 860, { rtl, size: 30, color: C.dim, spacing: 6 })
  let size = 300
  while (size > 160 && valueWidth(ctx, hero, size, 96, 20, 900) > W - M * 2) size -= 6
  drawValue(ctx, hero, x0, 1150, { rtl, size, unitPx: 96, gap: 20, valueWeight: 900, color: C.chalk, unitColor: C.brass })

  if (small.length) {
    ctx.fillStyle = C.line
    ctx.fillRect(M, 1259, W - M * 2, 2)
    const colW = (W - M * 2) / 2
    small.forEach((st, i) => {
      const x = rtl ? W - M - i * colW : M + i * colW
      drawLabel(ctx, st.label, x, 1350, { rtl, size: 28, color: C.dim, spacing: 5, maxW: colW - 40 })
      drawValue(ctx, st, x, 1530, { rtl, size: 170, unitPx: 60, gap: 14, valueWeight: 800, color: C.chalk, unitColor: C.brass })
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

  if (variant === 'sticker') {
    // Transparent picture: white text with a soft shadow reads on any photo.
    // A lighter gold than the app's brass so it still reads on pale photos.
    canvas.height = 500
    const accent = '#F0CF7A'
    const shadow = { color: 'rgba(0,0,0,0.5)', blur: 14 }
    const bottom = drawOverlayBlock(ctx, summary, { rtl, labels, top: 100, shadow, accent })
    setShadow(ctx, shadow.color, shadow.blur, 2)
    drawBrand(ctx, rtl ? W - M : M, bottom + 84, { rtl, color: accent })
    setShadow(ctx, null)
    return canvas
  }

  canvas.height = H
  if (variant === 'photo' && photo) {
    drawPhoto(ctx, photo)
    drawScrims(ctx)
    setShadow(ctx, 'rgba(0,0,0,0.35)', 10)
    drawBrand(ctx, rtl ? W - M : M, 310, { rtl, color: C.brass })
    setShadow(ctx, null)
    drawOverlayBlock(ctx, summary, { rtl, labels, top: 1360, shadow: { color: 'rgba(0,0,0,0.35)', blur: 12 }, accent: '#F0CF7A' })
    return canvas
  }

  drawPlain(ctx, summary, { rtl, labels })
  return canvas
}

const toBlob = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))

// Turns a photo the trainee picked into something drawImage can use, with
// phone-camera rotation (EXIF) applied so portrait shots aren't sideways.
// Huge photos are shrunk while decoding so a 50 MP picture can't run the
// phone out of memory. The file is read here only; it is never uploaded.
export async function loadPhoto(file) {
  const MAX = 2400
  if (typeof createImageBitmap === 'function') {
    try {
      let bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
      if (Math.max(bmp.width, bmp.height) > MAX) {
        const s = MAX / Math.max(bmp.width, bmp.height)
        const small = await createImageBitmap(bmp, { resizeWidth: Math.round(bmp.width * s), resizeHeight: Math.round(bmp.height * s), resizeQuality: 'high' })
        bmp.close?.()
        bmp = small
      }
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close?.() }
    } catch {
      /* fall through to the <img> route */
    }
  }
  // Older browsers: an <img> applies the camera rotation by itself.
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} }
  } finally {
    URL.revokeObjectURL(url)
  }
}

// Waits for fonts, draws the card and turns it into a ready-to-share file.
// Done ahead of the Share tap: Safari drops the tap's permission to open the
// share menu if we're still busy making the picture when we ask for it.
export async function prepareCard(summary, opts, fileName) {
  try {
    // Canvas won't pull web fonts by itself: ask for the ones the card uses,
    // with the exact text it draws, and wait (briefly) for them.
    await loadFonts([summary.routineName, ...Object.values(opts.labels || {})].join(' '))
  } catch {
    /* fonts are optional: the fallback stack still draws a fine card */
  }
  const canvas = renderShareCard(summary, opts)
  const blob = await toBlob(canvas)
  if (!blob) throw new Error('NO_IMAGE')
  return new File([blob], fileName, { type: 'image/png' })
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
