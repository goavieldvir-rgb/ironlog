// Draws the share picture for a finished workout on a canvas (no extra
// libraries) and hands it to the phone's share menu, falling back to a
// download where files can't be shared.
//
// The picture shows only four things on purpose: the workout's name, the
// big total (volume lifted, or distance for cardio, else time), the
// duration and the week streak. No exercises or sets, so it's easy to post
// and doesn't give the training plan away.
//
// Three looks: the plain Ironlog card, the same stats over the trainee's own
// photo, and a see-through sticker. Colours come straight from the app's
// Tailwind theme and the fonts are the app's own. Cards are a 1080 x 1920
// Instagram story; the top and bottom ~250px stay empty because Instagram
// puts its own buttons there. Photos are only ever drawn on this phone.
import tailwind from '../../tailwind.config.js'

const W = 1080
const H = 1920
const SAFE_TOP = 250
const SAFE_BOTTOM = 250
const BLOCK_H = 790 // height of the name + big number + small stats block
const T = tailwind.theme.extend.colors
const C = { ink: T.ink, chalk: T.chalk, dim: T.chalkdim, brass: T.brass, line: T.line }
const DISPLAY = '"Barlow Condensed", "Rubik", system-ui, sans-serif'
const MONO = '"IBM Plex Mono", "Rubik", ui-monospace, monospace'
// Every family and weight the card draws with. Hebrew letters aren't in the
// condensed or mono fonts, so Rubik (the app's Hebrew font) is loaded at the
// same weights, using Hebrew sample text so its Hebrew pieces download too.
const FONT_REQUESTS = [
  `500 100px ${DISPLAY}`,
  `600 100px ${DISPLAY}`,
  `700 100px ${DISPLAY}`,
  `500 30px ${MONO}`,
  '500 40px Rubik',
  '600 40px Rubik',
  '700 40px Rubik',
]

function fit(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1)
  return `${t}…`
}

// The big number and the small ones. Hero: volume lifted, else cardio
// distance, else duration, else set count. Small: duration and streak.
function pickStats(summary, labels) {
  const duration = summary.durationMinutes || (summary.cardioMinutes > 0 ? summary.cardioMinutes : null)
  const dist = summary.cardioDistance != null ? Math.round(summary.cardioDistance * 100) / 100 : null
  const stats = {
    volume: summary.volume > 0 && { label: labels.volume, value: summary.volume.toLocaleString('en-US'), unit: summary.volumeUnit },
    distance: dist != null && { label: labels.distance, value: String(dist), unit: summary.cardioUnit },
    duration: duration && { label: labels.duration, value: String(duration), unit: labels.min },
    sets: { label: labels.sets, value: String(summary.setCount), unit: '' },
    streak: summary.streakWeeks > 0 && { label: labels.streak, value: String(summary.streakWeeks), unit: labels.weekUnit },
  }
  const heroKey = ['volume', 'distance', 'duration', 'sets'].find((k) => stats[k])
  const small = ['duration', 'streak'].filter((k) => k !== heroKey && stats[k]).map((k) => stats[k])
  return { hero: stats[heroKey], small }
}

// Draws the name, hero number and small stats starting at y; returns the
// y where the block ends. `look` sets colours and an optional soft shadow.
function drawBlock(ctx, summary, { rtl, labels, y, look }) {
  const pad = 88
  const start = rtl ? W - pad : pad
  const startAlign = rtl ? 'right' : 'left'
  const dir = rtl ? 'rtl' : 'ltr'
  const { hero, small } = pickStats(summary, labels)

  const shadow = (on) => {
    ctx.shadowColor = on ? 'rgba(0,0,0,0.55)' : 'transparent'
    ctx.shadowBlur = on ? 18 : 0
    ctx.shadowOffsetY = on ? 4 : 0
  }
  shadow(look.shadow)
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = startAlign

  // workout name
  ctx.direction = dir
  ctx.fillStyle = look.text
  ctx.font = `700 104px ${DISPLAY}`
  ctx.fillText(fit(ctx, summary.routineName, W - pad * 2), start, y + 100)
  ctx.fillStyle = look.accent
  ctx.fillRect(rtl ? W - pad - 96 : pad, y + 136, 96, 8)

  // hero label and number (long numbers shrink to fit instead of being cut)
  ctx.fillStyle = look.dim
  ctx.font = `500 30px ${MONO}`
  ctx.fillText(rtl ? hero.label : hero.label.toUpperCase(), start, y + 244)
  ctx.direction = 'ltr'
  const heroMax = W - pad * 2 - (hero.unit ? 200 : 0)
  let heroSize = 300
  ctx.font = `500 ${heroSize}px ${DISPLAY}`
  while (heroSize > 120 && ctx.measureText(hero.value).width > heroMax) {
    heroSize -= 10
    ctx.font = `500 ${heroSize}px ${DISPLAY}`
  }
  const heroBase = y + 510
  ctx.fillStyle = look.text
  ctx.fillText(hero.value, start, heroBase)
  if (hero.unit) {
    const vw = ctx.measureText(hero.value).width
    ctx.font = `600 64px ${DISPLAY}`
    ctx.fillStyle = look.accent
    ctx.fillText(hero.unit, rtl ? start - vw - 24 : start + vw + 24, heroBase)
  }

  // small stats side by side, the first on the reading-start side
  let end = heroBase
  if (small.length) {
    const sy = heroBase + 90
    ctx.shadowColor = 'transparent'
    ctx.fillStyle = look.line
    ctx.fillRect(pad, sy, W - pad * 2, 2)
    shadow(look.shadow)
    const colW = (W - pad * 2) / 2
    small.forEach((st, i) => {
      const slot = rtl ? 1 - i : i
      const x = pad + slot * colW + (rtl ? colW - 8 : 8)
      ctx.textAlign = startAlign
      ctx.direction = 'ltr'
      ctx.fillStyle = look.text
      ctx.font = `500 96px ${DISPLAY}`
      const val = st.unit ? `${st.value} ${st.unit}` : st.value
      ctx.fillText(fit(ctx, val, colW - 24), x, sy + 120)
      ctx.direction = dir
      ctx.fillStyle = look.dim
      ctx.font = `500 26px ${MONO}`
      ctx.fillText(fit(ctx, rtl ? st.label : st.label.toUpperCase(), colW - 24), x, sy + 170)
    })
    end = sy + 190
  }
  shadow(false)
  return end
}

function drawBrand(ctx, y, look) {
  ctx.direction = 'ltr'
  ctx.textAlign = 'center'
  ctx.fillStyle = look.accent
  ctx.font = `700 40px ${DISPLAY}`
  ctx.fillText('IRONLOG', W / 2, y)
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
  g.addColorStop(0.35, 'rgba(20,22,26,0.15)')
  g.addColorStop(0.62, 'rgba(20,22,26,0.62)')
  g.addColorStop(1, 'rgba(20,22,26,0.92)')
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
    canvas.height = 940
    // A lighter gold than the app's brass so it still reads on pale photos.
    const look = { text: '#FFFFFF', dim: 'rgba(255,255,255,0.9)', accent: '#F0CF7A', line: 'rgba(255,255,255,0.5)', shadow: true }
    const end = drawBlock(ctx, summary, { rtl, labels, y: 30, look })
    ctx.shadowColor = 'rgba(0,0,0,0.55)'
    ctx.shadowBlur = 14
    drawBrand(ctx, end + 85, look)
    return canvas
  }

  canvas.height = H
  const light = { text: C.chalk, dim: C.dim, accent: C.brass, line: C.line, shadow: false }
  if (variant === 'photo' && photo) {
    drawPhoto(ctx, photo)
    // Sits low, over the darker part of the gradient, clear of the bottom 250px.
    const look = { text: '#FFFFFF', dim: 'rgba(255,255,255,0.8)', accent: C.brass, line: 'rgba(255,255,255,0.4)', shadow: true }
    drawBlock(ctx, summary, { rtl, labels, y: H - SAFE_BOTTOM - 70 - BLOCK_H, look })
    ctx.shadowColor = 'rgba(0,0,0,0.5)'
    ctx.shadowBlur = 12
    drawBrand(ctx, H - SAFE_BOTTOM + 10, look)
    return canvas
  }

  // plain card: ink background with a faint brass glow, content centred
  ctx.fillStyle = C.ink
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W / 2, 0, 80, W / 2, 0, 1100)
  glow.addColorStop(0, 'rgba(201,162,75,0.15)')
  glow.addColorStop(1, 'rgba(201,162,75,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)
  drawBlock(ctx, summary, { rtl, labels, y: SAFE_TOP + (H - SAFE_TOP - SAFE_BOTTOM - BLOCK_H) / 2, look: light })
  drawBrand(ctx, H - SAFE_BOTTOM - 10, light)
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
    // Canvas won't pull web fonts by itself: ask for the ones the card uses
    // so it matches the app, then wait for them.
    await Promise.all(FONT_REQUESTS.map((f) => document.fonts.load(f, 'Aa אב 123')))
    await document.fonts.ready
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
