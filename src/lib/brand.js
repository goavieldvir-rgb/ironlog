import { supabase } from '../supabase.js'

// A coach's look for their trainees (supabase-coach-branding.sql and
// supabase-brand-colors.sql): a name, a color and a small logo. The color is
// one of these names or the coach's own '#rrggbb'.
export { PALETTE, accentTokens, contrast, hexOf } from './accent.js'
import { accentTokens } from './accent.js'

const chan = (rgb) => rgb.join(' ')

export async function fetchMyBrand() {
  const { data, error } = await supabase.rpc('my_brand')
  if (error) return {}
  return data || {}
}

// Sets the app-wide accent (index.css --accent, --accent-fg, --accent-text).
// Null brings back the usual.
export function applyBrandColor(color) {
  if (typeof document === 'undefined') return
  const { accent, fg, text } = accentTokens(color || 'ember')
  const st = document.documentElement.style
  st.setProperty('--accent', chan(accent))
  st.setProperty('--accent-fg', chan(fg))
  st.setProperty('--accent-text', chan(text))
}

// For the picker: the swatch as the app will show it, and its check mark.
export const rgbOf = (color) => `rgb(${accentTokens(color).accent.join(',')})`
export const fgOf = (color) => `rgb(${accentTokens(color).fg.join(',')})`
export const isCustomColor = (color) => /^#[0-9a-fA-F]{6}$/.test(color || '')

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
