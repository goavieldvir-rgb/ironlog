// Draws the share picture for a finished workout on a canvas (no extra
// libraries) and hands it to the phone's share menu, falling back to a
// download where files can't be shared.
//
// The picture shows only four things on purpose: the workout's name, the
// big total (volume lifted, or distance for cardio, else time), the
// duration and the week streak. No exercises or sets, so it's easy to post
// and doesn't give the training plan away.
//
// Three looks, one style: a poster-style Ironlog card, the same stats over
// the trainee's own photo, and a see-through sticker. Colours come from the
// app's Tailwind theme. The poster fonts are loaded only when this screen
// opens, so the rest of the app doesn't get heavier. Cards are a 1080 x 1920
// Instagram story; the top and bottom ~250px stay empty because Instagram
// puts its own buttons there. Photos are only ever drawn on this phone.
import tailwind from '../../tailwind.config.js'

const W = 1080
const H = 1920
const M = 96 // side margin
const SAFE_TOP = 250
const SAFE_BOTTOM = 250
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
  return { hero: stats[heroKey], small }
}

// Vertical positions for the full poster card and for the shorter block that
// sits over a photo or becomes the sticker. All measured from the block top.
const FULL = { nameSize: 96, nameY: 110, ruleY: 146, heroMax: 700, heroY: 700, capY: 830, divY: 1030, statY: 1200, labelY: 1258, statSize: 150 }
const COMPACT = { nameSize: 72, nameY: 70, ruleY: 102, heroMax: 440, heroY: 560, capY: 690, divY: 750, statY: 890, labelY: 944, statSize: 120 }

// Draws name, hero number, caption and small stats from y; returns the
// bottom of the block. `look` sets colours and an optional soft shadow.
function drawBlock(ctx, summary, { rtl, labels, y, look, layout }) {
  const L = layout
  const x0 = rtl ? W - M : M
  const align = rtl ? 'right' : 'left'
  const dir = rtl ? 'rtl' : 'ltr'
  const { hero, small } = pickStats(summary, labels)
  const lbl = rtl ? LBL_HE : LBL_EN
  const disp = rtl ? HEB_DISPLAY : NUM
  const shadow = (on) => {
    ctx.shadowColor = on ? 'rgba(0,0,0,0.55)' : 'transparent'
    ctx.shadowBlur = on ? 18 : 0
    ctx.shadowOffsetY = on ? 4 : 0
  }
  shadow(look.shadow)
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = align

  // workout name
  ctx.direction = dir
  ctx.fillStyle = look.text
  // The name's face follows the letters in it, not the screen's language: a
  // Hebrew name gets Karantina, an English one gets the English capitals (Big
  // Shoulders has no Hebrew, Karantina has no Latin lowercase).
  const hebName = /[\u0590-\u05FF]/.test(summary.routineName)
  const name = hebName ? summary.routineName : summary.routineName.toUpperCase()
  const nameFont = hebName ? HEB_DISPLAY : NUM
  fitSize(ctx, name, hebName ? 700 : 800, nameFont, hebName ? L.nameSize * 1.25 : L.nameSize, 52, W - M * 2)
  ctx.fillText(fit(ctx, name, W - M * 2), x0, y + L.nameY)
  ctx.fillStyle = look.accent
  ctx.fillRect(rtl ? W - M - 72 : M, y + L.ruleY, 72, 8)

  // hero number: long totals shrink to the width instead of being cut
  ctx.direction = 'ltr'
  fitSize(ctx, hero.value, 900, NUM, L.heroMax, 200, W - M * 2 + 16)
  ctx.fillStyle = look.text
  ctx.textAlign = align
  ctx.fillText(hero.value, x0 + (rtl ? 8 : -8), y + L.heroY)

  // unit and what it measures, in the accent colour
  ctx.fillStyle = look.accent
  ctx.font = `700 40px ${lbl}`
  ctx.direction = dir
  const cap = (rtl ? [hero.label, hero.unit] : [hero.unit, hero.label]).filter(Boolean).join(' · ')
  if (rtl) {
    ctx.textAlign = 'right'
    ctx.fillText(cap, x0, y + L.capY)
  } else {
    tracked(ctx, cap.toUpperCase(), x0, y + L.capY, 7, 'left')
  }

  // small stats side by side, the first on the reading-start side
  let end = y + L.capY
  if (small.length) {
    shadow(false)
    ctx.fillStyle = look.line
    ctx.fillRect(M, y + L.divY, W - M * 2, 2)
    shadow(look.shadow)
    const colW = (W - M * 2) / 2
    small.forEach((st, i) => {
      const slot = rtl ? 1 - i : i
      const sx = rtl ? M + slot * colW + colW : M + slot * colW
      ctx.direction = 'ltr'
      ctx.textAlign = align
      ctx.fillStyle = look.text
      ctx.font = `800 ${L.statSize}px ${NUM}`
      ctx.fillText(st.value, sx, y + L.statY)
      const vw = ctx.measureText(st.value).width
      ctx.fillStyle = look.accent
      ctx.font = `${rtl ? 700 : 800} ${Math.round(L.statSize * 0.5)}px ${disp}`
      const unit = rtl ? st.unit : st.unit.toUpperCase()
      ctx.fillText(fit(ctx, unit, colW - vw - 40), rtl ? sx - vw - 18 : sx + vw + 18, y + L.statY)
      ctx.fillStyle = look.dim
      ctx.font = `600 28px ${lbl}`
      ctx.direction = dir
      if (rtl) {
        ctx.textAlign = 'right'
        ctx.fillText(fit(ctx, st.label, colW - 24), sx, y + L.labelY)
      } else {
        tracked(ctx, fit(ctx, st.label.toUpperCase(), colW - 24), sx, y + L.labelY, 5, 'left')
      }
    })
    end = y + L.labelY
  }
  shadow(false)
  return end
}

function drawBrand(ctx, y, look) {
  ctx.direction = 'ltr'
  ctx.fillStyle = look.accent
  ctx.font = `800 36px ${NUM}`
  tracked(ctx, 'IRONLOG', W / 2, y, 10, 'center')
}

// Fill-and-crop a photo to cover the whole story, then darken it with a
// gradient so white text stays readable on bright photos.
function drawPhoto(ctx, photo) {
  const scale = Math.max(W / photo.width, H / photo.height)
  const dw = photo.width * scale
  const dh = photo.height * scale
  ctx.drawImage(photo.source, (W - dw) / 2, (H - dh) / 2, dw, dh)
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, 'rgba(20,22,26,0.35)')
  g.addColorStop(0.3, 'rgba(20,22,26,0.1)')
  g.addColorStop(0.5, 'rgba(20,22,26,0.55)')
  g.addColorStop(1, 'rgba(20,22,26,0.94)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
}

// variant: 'plain' (default), 'photo' (needs `photo`) or 'sticker'.
// labels: { brand, duration, volume, distance, sets, streak, weekUnit, min }
export function renderShareCard(summary, { rtl, labels, variant = 'plain', photo = null }) {
  const canvas = document.createElement('canvas')
  canvas.width = W
  const ctx = canvas.getContext('2d')

  if (variant === 'sticker') {
    // Transparent picture: white text with a soft shadow reads on any photo.
    canvas.height = 1080
    // A lighter gold than the app's brass so it still reads on pale photos.
    const look = { text: '#FFFFFF', dim: 'rgba(255,255,255,0.9)', accent: '#F0CF7A', line: 'rgba(255,255,255,0.5)', shadow: true }
    const end = drawBlock(ctx, summary, { rtl, labels, y: 20, look, layout: COMPACT })
    ctx.shadowColor = 'rgba(0,0,0,0.55)'
    ctx.shadowBlur = 14
    drawBrand(ctx, end + 90, look)
    return canvas
  }

  canvas.height = H
  if (variant === 'photo' && photo) {
    drawPhoto(ctx, photo)
    // Sits low, over the darker part of the gradient, clear of the bottom 250px.
    const look = { text: '#FFFFFF', dim: 'rgba(255,255,255,0.85)', accent: C.brass, line: 'rgba(255,255,255,0.4)', shadow: true }
    const top = H - SAFE_BOTTOM - 80 - 960
    const end = drawBlock(ctx, summary, { rtl, labels, y: top, look, layout: COMPACT })
    ctx.shadowColor = 'rgba(0,0,0,0.5)'
    ctx.shadowBlur = 12
    drawBrand(ctx, end + 70, look)
    return canvas
  }

  // plain card: ink background, a faint warm light from the top corner
  const look = { text: C.chalk, dim: C.dim, accent: C.brass, line: C.line, shadow: false }
  ctx.fillStyle = C.ink
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W, 0, 0, W, 0, 1300)
  glow.addColorStop(0, 'rgba(201,162,75,0.16)')
  glow.addColorStop(1, 'rgba(201,162,75,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)
  drawBlock(ctx, summary, { rtl, labels, y: 250, look, layout: FULL })
  drawBrand(ctx, H - SAFE_BOTTOM - 30, look)
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
