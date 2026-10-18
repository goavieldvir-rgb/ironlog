// Nightly clean-up for progress photos, called by pg_cron (see
// supabase-progress-photos.sql). Deploy with verify_jwt = false; the function
// checks the x-cron-secret header itself.
//
// Removes:
//  - every photo of a trainee who hasn't logged a workout or added a photo
//    for 12 months (the retention period in the privacy notice);
//  - every photo of someone whose latest photo consent is 'withdrawn' (the
//    app deletes them on withdrawal; this catches an interrupted one);
//  - files in a folder whose account no longer exists (the app deletes them
//    before account deletion; this catches an interrupted one).
import { createClient } from 'npm:@supabase/supabase-js@2'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const BUCKET = 'progress-photos'
const RETENTION_DAYS = 365

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

async function removeFiles(paths: string[]) {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await db.storage.from(BUCKET).remove(paths.slice(i, i + 100))
    if (error) throw error
  }
}

async function folderFiles(folder: string) {
  const out: string[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(BUCKET).list(folder, { limit: 1000, offset })
    if (error) throw error
    for (const f of data || []) if (f.id) out.push(`${folder}/${f.name}`)
    if (!data || data.length < 1000) return out
  }
}

async function purge() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400_000)
  const cutoffDate = cutoff.toISOString().slice(0, 10)
  let removedPhotos = 0
  let removedOrphans = 0

  const { data: photos, error } = await db.from('progress_photos').select('id, user_id, path, created_at')
  if (error) throw error
  const byUser = new Map<string, typeof photos>()
  for (const p of photos || []) byUser.set(p.user_id, [...(byUser.get(p.user_id) || []), p])

  for (const [uid, list] of byUser) {
    const { data: consent, error: cErr } = await db
      .from('consents')
      .select('variant')
      .eq('user_id', uid)
      .eq('doc_key', 'progress-photos')
      .order('accepted_at', { ascending: false })
      .limit(1)
    if (cErr) throw cErr
    const withdrawn = consent?.[0]?.variant !== 'granted'
    const { data: last, error: sErr } = await db.from('sessions').select('date').eq('user_id', uid).order('date', { ascending: false }).limit(1)
    if (sErr) throw sErr
    const lastPhoto = list!.reduce((m, p) => (p.created_at > m ? p.created_at : m), '')
    const inactive = (!last?.[0] || last[0].date < cutoffDate) && new Date(lastPhoto) < cutoff
    if (!withdrawn && !inactive) continue
    await removeFiles(list!.map((p) => p.path))
    const { error: delErr } = await db.from('progress_photos').delete().in('id', list!.map((p) => p.id))
    if (delErr) throw delErr
    removedPhotos += list!.length
  }

  // Top-level folders are user ids; a folder with no matching profile was
  // left behind by a deleted account.
  const { data: folders, error: listErr } = await db.storage.from(BUCKET).list('', { limit: 1000 })
  if (listErr) throw listErr
  const names = (folders || []).filter((f) => !f.id).map((f) => f.name)
  if (names.length) {
    const { data: profiles, error: pErr } = await db.from('profiles').select('id').in('id', names)
    if (pErr) throw pErr
    const alive = new Set((profiles || []).map((p) => p.id))
    for (const folder of names.filter((n) => !alive.has(n))) {
      const files = await folderFiles(folder)
      await removeFiles(files)
      removedOrphans += files.length
    }
  }

  return json({ removedPhotos, removedOrphans })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  const { data: cfg } = await db.from('push_config').select('value').eq('key', 'cron_secret').single()
  const secret = req.headers.get('x-cron-secret')
  if (!cfg?.value || secret !== cfg.value) return json({ error: 'forbidden' }, 403)
  try {
    return await purge()
  } catch (e) {
    console.error(e)
    return json({ error: String((e as Error).message || e) }, 500)
  }
})
