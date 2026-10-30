// Progress photos: private files in the 'progress-photos' bucket, one row
// each in progress_photos. The database and storage rules decide who may see
// or add what (see supabase-progress-photos.sql); this file only talks to
// them.
import { supabase } from '../supabase.js'
import { recordConsent } from './db.js'
import { PHOTOS_DOC_KEY, PHOTOS_VERSION, photosTextHash } from '../legal/photos.js'
import { TERMS_DOC_KEY } from '../legal/terms.js'

const BUCKET = 'progress-photos'
export const ANGLES = ['front', 'side', 'back']
const MAX_SIDE = 1600
const THUMB_SIDE = 480

// { enabled, minor }: photos are on when the latest photo consent is
// 'granted', and never offered to anyone who ever signed up as under 18
// (the same rule as photos_allowed() in the database).
export async function fetchPhotoStatus(uid) {
  const [photos, minor] = await Promise.all([
    supabase.from('consents').select('variant, accepted_at').eq('user_id', uid).eq('doc_key', PHOTOS_DOC_KEY)
      .order('accepted_at', { ascending: false }).limit(1),
    supabase.from('consents').select('id').eq('user_id', uid).eq('doc_key', TERMS_DOC_KEY).eq('variant', 'minor').limit(1),
  ])
  if (photos.error) throw photos.error
  if (minor.error) throw minor.error
  return {
    enabled: photos.data?.[0]?.variant === 'granted',
    minor: minor.data.length > 0,
  }
}

export async function listPhotos(uid) {
  const { data, error } = await supabase
    .from('progress_photos')
    .select('*')
    .eq('user_id', uid)
    .order('taken_on', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

// Images are fetched once through the signed-in session and kept in memory
// as local object URLs, keyed by path. A path never changes its contents, so
// a photo loads once per visit instead of again every time a link would
// expire. A few at a time, so the photos on screen aren't stuck behind the
// rest.
const cache = new Map()
const queue = []
let active = 0
const MAX_ACTIVE = 4

function pump() {
  while (active < MAX_ACTIVE && queue.length) {
    const job = queue.shift()
    active++
    supabase.storage
      .from(BUCKET)
      .download(job.path)
      .then(({ data, error }) => {
        if (error) throw error
        job.resolve(URL.createObjectURL(data))
      })
      .catch((e) => {
        cache.delete(job.path)
        job.reject(e)
      })
      .finally(() => {
        active--
        pump()
      })
  }
}

const ready = new Map()

// path -> local URL (a promise; shared by everyone asking for the same path)
export function photoSrc(path) {
  if (!cache.has(path)) {
    cache.set(path, new Promise((resolve, reject) => {
      queue.push({ path, resolve, reject })
      pump()
    }).then((url) => {
      ready.set(path, url)
      return url
    }))
  }
  return cache.get(path)
}

// The local URL if it's already loaded, so a page can show it straight away.
export function photoSrcNow(path) {
  return ready.get(path) || null
}

function seed(path, blob) {
  const url = URL.createObjectURL(blob)
  cache.set(path, Promise.resolve(url))
  ready.set(path, url)
}

function forget(paths) {
  for (const p of paths) {
    const url = ready.get(p)
    if (url) URL.revokeObjectURL(url)
    cache.delete(p)
    ready.delete(p)
  }
}

// Nothing of one account stays in memory for whoever signs in next.
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') forget([...cache.keys()])
})

// The small version shown in grids; photos added before thumbnails existed
// fall back to the full image.
export const thumbPath = (photo) => photo.thumb_path || photo.path

// Saves one photo to the device, named by date and angle.
export async function downloadPhoto(photo) {
  const name = `progress-${photo.taken_on}-${photo.angle}.jpg`
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(photo.path, 60, { download: name })
  if (error) throw error
  const a = document.createElement('a')
  a.href = data.signedUrl
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
}

// Re-encodes the picked image as a JPEG no larger than MAX_SIDE, plus a
// small thumbnail for the grid. Drawing it on a canvas keeps only the pixels,
// so location and camera details in the original file never leave the phone.
// createImageBitmap decodes off the main thread (no frozen screen while a
// 12-megapixel photo opens) and applies the photo's rotation; where it can't
// read the file (older iPhones), an <img> does the same.
function decodeWithImg(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('IMAGE_DECODE_FAILED'))
    }
    img.src = url
  })
}

async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { source: bmp, w: bmp.width, h: bmp.height, done: () => bmp.close?.() }
    } catch {
      // fall through to <img>
    }
  }
  const img = await decodeWithImg(file)
  return { source: img, w: img.naturalWidth, h: img.naturalHeight, done: () => {} }
}

function encode(source, w, h, maxSide, quality) {
  const scale = Math.min(1, maxSide / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  const ctx = canvas.getContext('2d')
  // JPEG has no transparency; without this a see-through PNG turns black.
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('IMAGE_ENCODE_FAILED'))), 'image/jpeg', quality),
  )
}

export async function prepareImage(file) {
  const { source, w, h, done } = await decodeImage(file)
  try {
    const full = await encode(source, w, h, MAX_SIDE, 0.85)
    const thumb = await encode(source, w, h, THUMB_SIDE, 0.75)
    return { full, thumb }
  } finally {
    done()
  }
}

// Returns the saved row. The files are put in the in-memory cache straight
// away, so the new photo shows without downloading it back.
export async function addPhoto(uid, file, takenOn, angle) {
  const { full, thumb } = await prepareImage(file)
  const id = crypto.randomUUID()
  const path = `${uid}/${id}.jpg`
  const thumb_path = `${uid}/${id}_thumb.jpg`
  const [up, upThumb] = await Promise.all([
    supabase.storage.from(BUCKET).upload(path, full, { contentType: 'image/jpeg', upsert: false }),
    supabase.storage.from(BUCKET).upload(thumb_path, thumb, { contentType: 'image/jpeg', upsert: false }),
  ])
  const uploaded = [path, thumb_path].filter((_, i) => ![up, upThumb][i].error)
  if (up.error || upThumb.error) {
    if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded)
    throw up.error || upThumb.error
  }
  let res = await supabase.from('progress_photos').insert({ user_id: uid, taken_on: takenOn, angle, path, thumb_path }).select().single()
  // Before supabase-progress-photos-thumbs.sql is run there's no thumb_path
  // column: save the photo anyway, without a thumbnail.
  if (res.error && /thumb_path/.test(res.error.message || '')) {
    await supabase.storage.from(BUCKET).remove([thumb_path])
    res = await supabase.from('progress_photos').insert({ user_id: uid, taken_on: takenOn, angle, path }).select().single()
  }
  if (res.error) {
    await supabase.storage.from(BUCKET).remove([path, thumb_path])
    throw res.error
  }
  seed(path, full)
  if (res.data.thumb_path) seed(thumb_path, thumb)
  return res.data
}

// File first: a row without a file is harmless, a file without a row is not
// visible to anyone to delete.
export async function deletePhoto(photo) {
  const paths = [photo.path, photo.thumb_path].filter(Boolean)
  const { error: rmErr } = await supabase.storage.from(BUCKET).remove(paths)
  if (rmErr) throw rmErr
  const { error } = await supabase.from('progress_photos').delete().eq('id', photo.id)
  if (error) throw error
  forget(paths)
}

// Every file in the person's folder, including any whose row is missing.
export async function deleteAllPhotos(uid) {
  const rows = await listPhotos(uid)
  const { data: files, error: listErr } = await supabase.storage.from(BUCKET).list(uid, { limit: 1000 })
  if (listErr) throw listErr
  const paths = [...new Set([...rows.flatMap((r) => [r.path, r.thumb_path].filter(Boolean)), ...(files || []).filter((f) => f.id).map((f) => `${uid}/${f.name}`)])]
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await supabase.storage.from(BUCKET).remove(paths.slice(i, i + 100))
    if (error) throw error
  }
  if (rows.length) {
    const { error } = await supabase.from('progress_photos').delete().eq('user_id', uid)
    if (error) throw error
  }
  forget(paths)
}

export async function turnPhotosOn(uid, lang) {
  await recordConsent(uid, {
    docKey: PHOTOS_DOC_KEY,
    version: PHOTOS_VERSION,
    variant: 'granted',
    lang,
    textSha256: await photosTextHash(lang),
  })
}

// Deletes everything, then records the withdrawal. If deleting fails the
// consent stays as it was, so nothing is left behind under an "off" switch.
export async function turnPhotosOff(uid, lang) {
  await deleteAllPhotos(uid)
  await recordConsent(uid, {
    docKey: PHOTOS_DOC_KEY,
    version: PHOTOS_VERSION,
    variant: 'withdrawn',
    lang,
    textSha256: await photosTextHash(lang),
  })
}
