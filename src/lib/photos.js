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
// Links to an image stop working after this long, so a copied link is useless.
const LINK_SECONDS = 300
const MAX_SIDE = 1600

// { enabled, minor }: photos are on when the latest photo consent is
// 'granted', and never offered to someone who signed up as under 18.
export async function fetchPhotoStatus(uid) {
  const [photos, terms] = await Promise.all([
    supabase.from('consents').select('variant, accepted_at').eq('user_id', uid).eq('doc_key', PHOTOS_DOC_KEY)
      .order('accepted_at', { ascending: false }).limit(1),
    supabase.from('consents').select('variant').eq('user_id', uid).eq('doc_key', TERMS_DOC_KEY)
      .order('version', { ascending: false }).order('accepted_at', { ascending: false }).limit(1),
  ])
  if (photos.error) throw photos.error
  if (terms.error) throw terms.error
  return {
    enabled: photos.data?.[0]?.variant === 'granted',
    since: photos.data?.[0]?.variant === 'granted' ? photos.data[0].accepted_at : null,
    minor: terms.data?.[0]?.variant === 'minor',
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

// path -> short-lived URL
export async function photoUrls(paths) {
  if (!paths.length) return {}
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, LINK_SECONDS)
  if (error) throw error
  return Object.fromEntries((data || []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]))
}

// Re-encodes the picked image as a JPEG no larger than MAX_SIDE. Drawing it
// on a canvas keeps only the pixels, so location and camera details in the
// original file never leave the phone.
export async function prepareImage(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
  if (!blob) throw new Error('IMAGE_ENCODE_FAILED')
  return blob
}

export async function addPhoto(uid, file, takenOn, angle) {
  const blob = await prepareImage(file)
  const path = `${uid}/${crypto.randomUUID()}.jpg`
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false })
  if (upErr) throw upErr
  const { error } = await supabase.from('progress_photos').insert({ user_id: uid, taken_on: takenOn, angle, path })
  if (error) {
    await supabase.storage.from(BUCKET).remove([path])
    throw error
  }
}

// File first: a row without a file is harmless, a file without a row is not
// visible to anyone to delete.
export async function deletePhoto(photo) {
  const { error: rmErr } = await supabase.storage.from(BUCKET).remove([photo.path])
  if (rmErr) throw rmErr
  const { error } = await supabase.from('progress_photos').delete().eq('id', photo.id)
  if (error) throw error
}

// Every file in the person's folder, including any whose row is missing.
export async function deleteAllPhotos(uid) {
  const rows = await listPhotos(uid)
  const { data: files, error: listErr } = await supabase.storage.from(BUCKET).list(uid, { limit: 1000 })
  if (listErr) throw listErr
  const paths = [...new Set([...rows.map((r) => r.path), ...(files || []).filter((f) => f.id).map((f) => `${uid}/${f.name}`)])]
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await supabase.storage.from(BUCKET).remove(paths.slice(i, i + 100))
    if (error) throw error
  }
  if (rows.length) {
    const { error } = await supabase.from('progress_photos').delete().eq('user_id', uid)
    if (error) throw error
  }
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
