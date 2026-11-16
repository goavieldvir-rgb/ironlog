import { supabase } from '../supabase.js'

// A coach's look for their trainees (supabase-coach-branding.sql): a name,
// one of these accent colours and a small logo. Every colour here keeps the
// app's dark text readable on accent buttons.
export const PALETTE = {
  ember: '255 91 58',
  gold: '250 204 21',
  lime: '163 230 53',
  mint: '74 222 128',
  teal: '45 212 191',
  sky: '56 189 248',
  violet: '167 139 250',
  pink: '244 114 182',
}
const DEFAULT_ACCENT = PALETTE.ember

export async function fetchMyBrand() {
  const { data, error } = await supabase.rpc('my_brand')
  if (error) return {}
  return data || {}
}

// Sets the app-wide accent (index.css --accent). Null brings back the usual.
export function applyBrandColor(color) {
  if (typeof document === 'undefined') return
  document.documentElement.style.setProperty('--accent', PALETTE[color] || DEFAULT_ACCENT)
}

export const rgbOf = (color) => `rgb(${(PALETTE[color] || DEFAULT_ACCENT).split(' ').join(',')})`

// A picked image as a 160px square (centre crop) data URL, small enough to
// keep in the settings row.
export function resizeLogo(file, size = 160) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error('NOT_IMAGE'))
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight)
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size)
      URL.revokeObjectURL(url)
      let out = canvas.toDataURL('image/webp', 0.85)
      if (!out.startsWith('data:image/webp')) out = canvas.toDataURL('image/png')
      if (out.length >= 120000) out = canvas.toDataURL('image/jpeg', 0.8)
      resolve(out)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('NOT_IMAGE'))
    }
    img.src = url
  })
}
