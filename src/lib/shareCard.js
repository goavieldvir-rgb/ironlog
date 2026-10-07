// Draws the share picture for a finished workout on a canvas (no extra
// libraries) and hands it to the phone's share menu, falling back to a
// download where files can't be shared.
const W = 1080
const FONT = '"Inter", "Rubik", system-ui, -apple-system, "Segoe UI", sans-serif'
const C = { ink: '#14161A', surface: '#1C1F26', chalk: '#EDEDE6', dim: '#9CA0AA', brass: '#C9A24B', line: '#31353E' }
const LRI = '⁦'
const PDI = '⁩'
const iso = (s) => `${LRI}${s}${PDI}`

function fit(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1)
  return `${t}…`
}

// labels: { brand, duration, volume, records, sets, prTag, more }
export function renderShareCard(summary, { rtl, dateText, labels }) {
  const pad = 72
  const rows = summary.rows.slice(0, 6)
  const hidden = summary.rows.length - rows.length
  const stats = []
  if (summary.durationMinutes) stats.push([labels.duration, iso(`${summary.durationMinutes} ${labels.min}`)])
  if (summary.volume > 0) stats.push([labels.volume, iso(`${summary.volume.toLocaleString('en-US')} ${summary.volumeUnit}`)])
  if (summary.prCount > 0) stats.push([labels.records, iso(String(summary.prCount))])
  if (summary.cardioMinutes > 0) stats.push([labels.cardio, iso(`${summary.cardioMinutes} ${labels.min}`)])
  if (summary.cardioDistance != null) stats.push([labels.distance, iso(`${Math.round(summary.cardioDistance * 100) / 100} ${summary.cardioUnit}`)])
  stats.push([labels.sets, iso(String(summary.setCount))])
  const shownStats = stats.slice(0, 3)

  const rowH = 96
  const H = 520 + rows.length * rowH + (hidden > 0 ? 70 : 0) + 150
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  const start = rtl ? W - pad : pad
  const end = rtl ? pad : W - pad
  ctx.direction = rtl ? 'rtl' : 'ltr'
  const startAlign = rtl ? 'right' : 'left'
  const endAlign = rtl ? 'left' : 'right'
  ctx.textBaseline = 'alphabetic'

  ctx.fillStyle = C.ink
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = C.brass
  ctx.fillRect(0, 0, W, 14)

  ctx.textAlign = startAlign
  ctx.fillStyle = C.brass
  ctx.font = `700 34px ${FONT}`
  ctx.fillText(labels.brand, start, 104)
  ctx.fillStyle = C.dim
  ctx.font = `500 32px ${FONT}`
  ctx.textAlign = endAlign
  ctx.fillText(dateText, end, 104)

  ctx.textAlign = startAlign
  ctx.fillStyle = C.chalk
  ctx.font = `800 76px ${FONT}`
  ctx.fillText(fit(ctx, summary.routineName, W - pad * 2), start, 215)

  // stat tiles
  const gap = 24
  const n = shownStats.length
  const tileW = (W - pad * 2 - gap * (n - 1)) / n
  shownStats.forEach(([label, value], i) => {
    const x = pad + i * (tileW + gap)
    ctx.fillStyle = C.surface
    ctx.beginPath()
    ctx.roundRect(x, 260, tileW, 170, 22)
    ctx.fill()
    ctx.textAlign = 'center'
    ctx.direction = 'ltr'
    ctx.fillStyle = C.chalk
    ctx.font = `800 46px ${FONT}`
    ctx.fillText(fit(ctx, value, tileW - 24), x + tileW / 2, 345)
    ctx.direction = rtl ? 'rtl' : 'ltr'
    ctx.fillStyle = C.dim
    ctx.font = `500 26px ${FONT}`
    ctx.fillText(fit(ctx, label, tileW - 24), x + tileW / 2, 395)
  })

  // exercises
  let y = 500
  ctx.strokeStyle = C.line
  ctx.lineWidth = 2
  rows.forEach((r) => {
    ctx.beginPath()
    ctx.moveTo(pad, y)
    ctx.lineTo(W - pad, y)
    ctx.stroke()
    const base = y + 60
    ctx.textAlign = endAlign
    ctx.fillStyle = C.chalk
    ctx.font = `700 34px ${FONT}`
    ctx.direction = 'ltr'
    const valueText = iso(r.text)
    const vw = ctx.measureText(valueText).width
    ctx.fillText(valueText, end, base)
    ctx.direction = rtl ? 'rtl' : 'ltr'
    let nameMax = W - pad * 2 - vw - 40
    ctx.textAlign = startAlign
    ctx.font = `600 34px ${FONT}`
    let name = r.name
    if (r.pr) nameMax -= 130
    name = fit(ctx, name, nameMax)
    ctx.fillStyle = C.chalk
    ctx.fillText(name, start, base)
    if (r.pr) {
      const nw = ctx.measureText(name).width
      const tagX = rtl ? start - nw - 18 : start + nw + 18
      ctx.font = `800 22px ${FONT}`
      const tw = ctx.measureText(labels.prTag).width + 28
      const bx = rtl ? tagX - tw : tagX
      ctx.fillStyle = C.brass
      ctx.beginPath()
      ctx.roundRect(bx, base - 32, tw, 40, 20)
      ctx.fill()
      ctx.fillStyle = C.ink
      ctx.textAlign = 'center'
      ctx.fillText(labels.prTag, bx + tw / 2, base - 3)
    }
    y += rowH
  })
  if (hidden > 0) {
    ctx.textAlign = startAlign
    ctx.fillStyle = C.dim
    ctx.font = `500 30px ${FONT}`
    ctx.fillText(labels.more.replace('{n}', String(hidden)), start, y + 50)
    y += 70
  }

  ctx.strokeStyle = C.line
  ctx.beginPath()
  ctx.moveTo(pad, y + 20)
  ctx.lineTo(W - pad, y + 20)
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.direction = 'ltr'
  ctx.fillStyle = C.brass
  ctx.font = `700 30px ${FONT}`
  ctx.fillText('IRONLOG', W / 2, y + 85)
  return canvas
}

const toBlob = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))

// Waits for fonts, draws the card and turns it into a ready-to-share file.
// Done ahead of the Share tap: Safari drops the tap's permission to open the
// share menu if we're still busy making the picture when we ask for it.
export async function prepareCard(summary, opts, fileName) {
  try {
    await document.fonts?.ready
  } catch {
    /* fonts are optional */
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
