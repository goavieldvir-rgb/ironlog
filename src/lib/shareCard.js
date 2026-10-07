// Draws the share picture for a finished workout on a canvas (no extra
// libraries) and hands it to the phone's share menu, falling back to a
// download where files can't be shared.
//
// Colours come straight from the app's Tailwind theme and the fonts are the
// app's own, so the card looks like it came from Ironlog. The size is a
// 1080 x 1920 Instagram story; the top and bottom ~250px stay empty because
// Instagram puts its own buttons there.
import tailwind from '../../tailwind.config.js'

const W = 1080
const H = 1920
const SAFE_TOP = 250
const SAFE_BOTTOM = 250
const T = tailwind.theme.extend.colors
const C = { ink: T.ink, surface: T.surface, chalk: T.chalk, dim: T.chalkdim, brass: T.brass, line: T.line }
const DISPLAY = '"Barlow Condensed", "Rubik", system-ui, sans-serif'
const BODY = 'Inter, "Rubik", system-ui, -apple-system, "Segoe UI", sans-serif'
const MONO = '"IBM Plex Mono", "Rubik", ui-monospace, monospace'
// Every family and weight the card draws with. Hebrew letters aren't in the
// condensed or mono fonts, so Rubik (the app's Hebrew font) is loaded at the
// same weights, using Hebrew sample text so its Hebrew pieces download too.
const FONT_REQUESTS = [
  `500 100px ${DISPLAY}`,
  `600 100px ${DISPLAY}`,
  `700 100px ${DISPLAY}`,
  `600 40px ${BODY}`,
  `500 30px ${MONO}`,
  `700 30px ${MONO}`,
  '500 40px Rubik',
  '600 40px Rubik',
  '700 40px Rubik',
]
const LRI = '\u2066'
const PDI = '\u2069'
const iso = (s) => `${LRI}${s}${PDI}`

function fit(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1)
  return `${t}…`
}

// ctx.roundRect is missing before iOS 16, so fall back to a plain rectangle.
function roundRect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r)
  else ctx.rect(x, y, w, h)
}

// One big number plus a few smaller ones. The hero is the most telling stat
// the workout has: volume, else cardio distance, else cardio time, else time.
function pickStats(summary, labels) {
  const all = []
  const km = summary.cardioDistance != null ? Math.round(summary.cardioDistance * 100) / 100 : null
  if (summary.volume > 0) all.push({ key: 'volume', label: labels.volume, value: summary.volume.toLocaleString('en-US'), unit: summary.volumeUnit })
  if (km != null) all.push({ key: 'distance', label: labels.distance, value: String(km), unit: summary.cardioUnit })
  if (summary.cardioMinutes > 0) all.push({ key: 'cardio', label: labels.cardio, value: String(summary.cardioMinutes), unit: labels.min })
  if (summary.durationMinutes) all.push({ key: 'duration', label: labels.duration, value: String(summary.durationMinutes), unit: labels.min })
  if (summary.prCount > 0) all.push({ key: 'records', label: labels.records, value: String(summary.prCount), unit: '' })
  all.push({ key: 'sets', label: labels.sets, value: String(summary.setCount), unit: '' })
  return { hero: all[0], small: all.slice(1, 4) }
}

// labels: { brand, duration, volume, records, sets, cardio, distance, prTag, more, min }
export function renderShareCard(summary, { rtl, dateText, labels }) {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  const pad = 88
  const start = rtl ? W - pad : pad
  const end = rtl ? pad : W - pad
  const startAlign = rtl ? 'right' : 'left'
  const endAlign = rtl ? 'left' : 'right'
  const dir = rtl ? 'rtl' : 'ltr'
  ctx.textBaseline = 'alphabetic'

  // background: the app's dark ink with a faint brass glow at the top
  ctx.fillStyle = C.ink
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W / 2, 0, 80, W / 2, 0, 1100)
  glow.addColorStop(0, 'rgba(201,162,75,0.15)')
  glow.addColorStop(1, 'rgba(201,162,75,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  // header: date (the brand mark sits at the bottom)
  let y = SAFE_TOP + 50
  ctx.direction = 'ltr'
  ctx.textAlign = startAlign
  ctx.fillStyle = C.dim
  ctx.font = `500 30px ${MONO}`
  ctx.direction = dir
  ctx.fillText(dateText, start, y - 4)

  // routine name
  y += 120
  ctx.direction = dir
  ctx.textAlign = startAlign
  ctx.fillStyle = C.chalk
  ctx.font = `700 104px ${DISPLAY}`
  ctx.fillText(fit(ctx, summary.routineName, W - pad * 2), start, y)
  ctx.fillStyle = C.brass
  ctx.fillRect(rtl ? W - pad - 96 : pad, y + 36, 96, 8)

  // hero number
  const { hero, small } = pickStats(summary, labels)
  y += 120
  ctx.textAlign = startAlign
  ctx.direction = dir
  ctx.fillStyle = C.dim
  ctx.font = `500 30px ${MONO}`
  ctx.fillText(rtl ? hero.label : hero.label.toUpperCase(), start, y + 24)
  ctx.direction = 'ltr'
  ctx.fillStyle = C.chalk
  // Long numbers (1,234,567 lb) shrink to fit instead of being cut off.
  const heroValue = hero.value
  const heroMax = W - pad * 2 - (hero.unit ? 200 : 0)
  let heroSize = 300
  ctx.font = `500 ${heroSize}px ${DISPLAY}`
  while (heroSize > 120 && ctx.measureText(heroValue).width > heroMax) {
    heroSize -= 10
    ctx.font = `500 ${heroSize}px ${DISPLAY}`
  }
  const heroBase = y + 290
  ctx.fillText(heroValue, start, heroBase)
  if (hero.unit) {
    const vw = ctx.measureText(heroValue).width
    ctx.font = `600 64px ${DISPLAY}`
    ctx.fillStyle = C.brass
    const ux = rtl ? start - vw - 24 : start + vw + 24
    ctx.fillText(hero.unit, ux, heroBase)
  }

  // smaller stats, evenly spread, first one on the reading-start side
  y = heroBase + 90
  const n = small.length
  const colW = (W - pad * 2) / Math.max(n, 1)
  ctx.strokeStyle = C.line
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(pad, y)
  ctx.lineTo(W - pad, y)
  ctx.stroke()
  small.forEach((st, i) => {
    const slot = rtl ? n - 1 - i : i
    const x0 = pad + slot * colW
    const x = rtl ? x0 + colW - 8 : x0 + 8
    ctx.textAlign = startAlign
    ctx.direction = 'ltr'
    ctx.fillStyle = C.chalk
    ctx.font = `500 96px ${DISPLAY}`
    const val = st.unit ? `${st.value} ${st.unit}` : st.value
    ctx.fillText(fit(ctx, val, colW - 24), x, y + 120)
    ctx.direction = dir
    ctx.fillStyle = C.dim
    ctx.font = `500 26px ${MONO}`
    ctx.fillText(fit(ctx, rtl ? st.label : st.label.toUpperCase(), colW - 24), x, y + 170)
  })
  y += 230

  // best set per exercise (kept short so it clears the bottom safe zone)
  const maxRows = 4
  const rows = summary.rows.slice(0, maxRows)
  const hidden = summary.rows.length - rows.length
  const rowH = 92
  rows.forEach((r) => {
    ctx.strokeStyle = C.line
    ctx.beginPath()
    ctx.moveTo(pad, y)
    ctx.lineTo(W - pad, y)
    ctx.stroke()
    const base = y + 60
    ctx.direction = 'ltr'
    ctx.textAlign = endAlign
    ctx.fillStyle = C.dim
    ctx.font = `500 32px ${MONO}`
    const valueText = iso(r.text)
    const vw = ctx.measureText(valueText).width
    ctx.fillText(valueText, end, base)
    ctx.direction = dir
    ctx.textAlign = startAlign
    ctx.font = `600 38px ${BODY}`
    const nameMax = W - pad * 2 - vw - 40 - (r.pr ? 120 : 0)
    const name = fit(ctx, r.name, nameMax)
    ctx.fillStyle = C.chalk
    ctx.fillText(name, start, base)
    if (r.pr) {
      const nw = ctx.measureText(name).width
      ctx.font = `700 22px ${MONO}`
      const tw = ctx.measureText(labels.prTag).width + 30
      const bx = rtl ? start - nw - 16 - tw : start + nw + 16
      ctx.fillStyle = C.brass
      ctx.beginPath()
      roundRect(ctx, bx, base - 34, tw, 42, 21)
      ctx.fill()
      ctx.fillStyle = C.ink
      ctx.textAlign = 'center'
      ctx.fillText(labels.prTag, bx + tw / 2, base - 3)
    }
    y += rowH
  })
  if (hidden > 0) {
    ctx.textAlign = startAlign
    ctx.direction = dir
    ctx.fillStyle = C.dim
    ctx.font = `500 28px ${MONO}`
    ctx.fillText(labels.more.replace('{n}', String(hidden)), start, y + 42)
  }

  // small brand mark at the bottom of the safe area
  ctx.direction = 'ltr'
  ctx.textAlign = 'center'
  ctx.fillStyle = C.brass
  ctx.font = `700 40px ${DISPLAY}`
  ctx.fillText(labels.brand, W / 2, H - SAFE_BOTTOM - 10)
  return canvas
}

const toBlob = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))

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
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
  return 'downloaded'
}
