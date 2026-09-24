import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'

// Generic live-ish collection hook: fetches rows owned by `uid` from `table`,
// ordered by `orderField`. Call the returned refresh() after any mutation
// made from the same screen so the list updates immediately.
export function useCollection(uid, table, orderField = 'created_at', direction = 'desc') {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (!uid) return
    let cancelled = false
    setLoading(true)

    supabase
      .from(table)
      .select('*')
      .eq('user_id', uid)
      .order(orderField, { ascending: direction === 'asc' })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) console.error(error)
        setData(data || [])
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [uid, table, orderField, direction, reload])

  return [data, loading, () => setReload((r) => r + 1)]
}

// Reads the shared global_exercises table — no user_id filter, since it's
// readable by every signed-in account (see supabase-global-library-upgrade.sql).
export function useGlobalExercises() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('global_exercises')
      .select('*')
      .order('name', { ascending: true })
      .then(({ data, error }) => {
        if (error) console.error(error)
        setData(data || [])
        setLoading(false)
      })
  }, [])

  return [data, loading]
}

// Fetches a single profile row (for the effective/acted-as user, which
// AdminContext's own `profile` doesn't cover — that one is always the
// logged-in admin's own row). Used for per-person settings that a
// trainee sets for themselves, like which Dashboard style they prefer.
export function useProfile(uid) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (!uid) return
    let cancelled = false
    setLoading(true)
    supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) console.error(error)
        setData(data || null)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [uid, reload])

  return [data, loading, () => setReload((r) => r + 1)]
}

export async function updateDashboardStyle(uid, style) {
  const { error } = await supabase.from('profiles').update({ dashboard_style: style }).eq('id', uid)
  if (error) throw error
}

// ---- Consent (terms acceptance) ----
// Reads the newest acceptance for this person. The table only allows
// inserts, so accepting again simply adds a row and the history is kept.
export async function fetchLatestConsent(uid, docKey) {
  const { data, error } = await supabase
    .from('consents')
    .select('*')
    .eq('user_id', uid)
    .eq('doc_key', docKey)
    .order('version', { ascending: false })
    .order('accepted_at', { ascending: false })
    .limit(1)
  if (error) throw error
  return data?.[0] || null
}

export async function recordConsent(uid, consent) {
  const { error } = await supabase.from('consents').insert({
    user_id: uid,
    doc_key: consent.docKey,
    version: consent.version,
    variant: consent.variant,
    lang: consent.lang,
    text_sha256: consent.textSha256,
    guardian_name: consent.guardianName || null,
    guardian_contact: consent.guardianContact || null,
  })
  if (error) throw error
}

// ---- Weekly schedule (recurring — "Sunday is always Pull Day") ----
// day_of_week: 0 = Sunday ... 6 = Saturday. slot: 0-2, up to three
// independent routines per day (e.g. cardio + strength on the same day).
// A day with no row for a slot, or a row with routine_id null, both mean
// that slot is empty — a day only counts as a full rest day when every
// slot is empty.
export async function setScheduleDay(uid, dayOfWeek, slot, routineId) {
  const { error } = await supabase
    .from('weekly_schedule')
    .upsert(
      { user_id: uid, day_of_week: dayOfWeek, slot, routine_id: routineId, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,day_of_week,slot' },
    )
  if (error) throw error
}

// ---- Exercises ----
export async function addExercise(uid, exercise) {
  const { data, error } = await supabase
    .from('exercises')
    .insert({
      user_id: uid,
      name: exercise.name,
      name_he: exercise.nameHe || null,
      category: exercise.category || 'strength', // 'strength' | 'mobility' | 'cardio'
      video_url: exercise.videoUrl || '',
      notes: exercise.notes || '',
      unit: exercise.unit || 'kg', // weight unit, or distance unit (km/mi) for cardio
      bodyweight: !!exercise.bodyweight,
      intensity_type: exercise.intensityType || 'rpe', // 'rpe' | 'hr_zone', cardio only
      track_rir: !!exercise.trackRir, // strength/bodyweight only — reps in reserve per set
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateExercise(uid, id, patch) {
  const row = {}
  if (patch.name !== undefined) row.name = patch.name
  if (patch.category !== undefined) row.category = patch.category
  if (patch.videoUrl !== undefined) row.video_url = patch.videoUrl
  if (patch.notes !== undefined) row.notes = patch.notes
  if (patch.unit !== undefined) row.unit = patch.unit
  if (patch.bodyweight !== undefined) row.bodyweight = patch.bodyweight
  if (patch.intensityType !== undefined) row.intensity_type = patch.intensityType
  if (patch.trackRir !== undefined) row.track_rir = patch.trackRir
  const { error } = await supabase.from('exercises').update(row).eq('id', id).eq('user_id', uid)
  if (error) throw error
}

export async function deleteExercise(uid, id) {
  const { error } = await supabase.from('exercises').delete().eq('id', id).eq('user_id', uid)
  if (error) throw error
}

// ---- Routines ----

// Copies a routine into ANOTHER person's account (admin → trainee). The
// routine's items point at exercise IDs, and those IDs belong to the
// source account — a trainee can't read or update someone else's
// exercises, so copying the IDs as-is left the trainee with a routine
// whose "previously logged" hints never worked and whose exercises never
// appeared in their own library. This maps every item onto the target
// person's own library instead: reuse their exercise if they already
// have one with the same name and category, otherwise create it.
export async function copyRoutineToUser(targetUid, routine) {
  const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase()
  const sourceIds = [...new Set((routine.exercises || []).map((it) => it.exerciseId).filter(Boolean))]

  const [{ data: targetExercises, error: e1 }, { data: sourceExercises, error: e2 }] = await Promise.all([
    supabase.from('exercises').select('*').eq('user_id', targetUid),
    sourceIds.length ? supabase.from('exercises').select('*').in('id', sourceIds) : Promise.resolve({ data: [] }),
  ])
  if (e1) throw e1
  if (e2) throw e2

  const pool = [...(targetExercises || [])]
  const mapped = []
  for (const it of routine.exercises || []) {
    const src = (sourceExercises || []).find((e) => e.id === it.exerciseId)
    const name = src?.name || it.name
    const category = src?.category || it.category || routine.category || 'strength'
    let match = pool.find((e) => norm(e.name) === norm(name) && e.category === category)
    if (!match) {
      match = await addExercise(targetUid, {
        name,
        nameHe: src?.name_he || null,
        category,
        unit: src?.unit || it.unit,
        bodyweight: src?.bodyweight ?? it.bodyweight,
        intensityType: src?.intensity_type || it.intensityType,
        trackRir: src?.track_rir,
        videoUrl: src?.video_url || it.videoUrl || '',
        notes: src?.notes || '',
      })
      pool.push(match)
    }
    mapped.push({ ...it, exerciseId: match.id, name: match.name })
  }
  await addRoutine(targetUid, { name: routine.name, category: routine.category, exercises: mapped })
}
export async function addRoutine(uid, routine) {
  const { error } = await supabase.from('routines').insert({
    user_id: uid,
    name: routine.name,
    category: routine.category || 'strength',
    exercises: routine.exercises || [],
  })
  if (error) throw error
}

export async function updateRoutine(uid, id, patch) {
  const row = {}
  if (patch.name !== undefined) row.name = patch.name
  if (patch.category !== undefined) row.category = patch.category
  if (patch.exercises !== undefined) row.exercises = patch.exercises
  const { error } = await supabase.from('routines').update(row).eq('id', id).eq('user_id', uid)
  if (error) throw error
}

export async function deleteRoutine(uid, id) {
  const { error } = await supabase.from('routines').delete().eq('id', id).eq('user_id', uid)
  if (error) throw error
}

// A completed set/interval: strength & mobility need reps (weight optional
// for bodyweight exercises); cardio needs a duration (intensity/distance
// optional).
function isCompletedSet(entry, s) {
  if (entry.category === 'cardio') {
    return s.duration !== '' && s.duration !== null && s.duration !== undefined
  }
  const repsOk = s.reps !== '' && s.reps !== null
  const weightOk = entry.bodyweight ? true : s.weight !== '' && s.weight !== null
  return repsOk && weightOk
}

// Strips sets that were planned but never filled in (e.g. a routine that
// targets 3 sets when only 2 were done), and exercises left with no
// completed sets at all. Without this, blank sets were stored permanently —
// inflating set counts in History, showing empty rows on the session page,
// and tripping up anything that reads history later (the admin PR alert
// crashed on exactly this once).
export function cleanEntries(entries) {
  return (entries || [])
    .map((e) => ({ ...e, sets: (e.sets || []).filter((s) => isCompletedSet(e, s)) }))
    .filter((e) => e.sets.length > 0)
}

// ---- Sessions (a completed workout log) ----
export async function logSession(uid, session) {
  session = { ...session, entries: cleanEntries(session.entries) }
  if (session.entries.length === 0) throw new Error('EMPTY_SESSION')
  const { error: sessionError } = await supabase.from('sessions').insert({
    user_id: uid,
    routine_id: session.routineId || null,
    routine_name: session.routineName || 'Freestyle',
    category: session.category || 'strength',
    date: session.date,
    notes: session.notes || '',
    entries: session.entries,
    ...(session.startedAt ? { started_at: session.startedAt } : {}),
    ...(session.durationMinutes != null ? { duration_minutes: session.durationMinutes } : {}),
  })
  if (sessionError) throw sessionError

  // Only overwrite an exercise's remembered note when a new one was
  // actually written — a session with no note shouldn't erase "seat on 4".
  const noteFields = (entry) =>
    entry.notes && entry.notes.trim() ? { last_note: entry.notes.trim(), last_note_date: session.date } : {}

  // Denormalize "last performance" onto each exercise for quick lookup
  // when building the next session.
  for (const entry of session.entries) {
    if (!entry.exerciseId) continue
    const completedSets = (entry.sets || []).filter((s) => isCompletedSet(entry, s))
    if (completedSets.length === 0) continue
    const last = completedSets[completedSets.length - 1]

    if (entry.category === 'cardio') {
      const { error } = await supabase
        .from('exercises')
        .update({
          last_weight: Number(last.duration) || 0, // minutes
          last_reps: Number(last.intensity) || 0,
          last_distance: last.distance !== '' && last.distance != null ? Number(last.distance) : null,
          last_date: session.date,
          ...noteFields(entry),
          last_sets: completedSets.map((s) => ({
            duration: Number(s.duration) || 0,
            intensity: Number(s.intensity) || 0,
            distance: s.distance !== '' && s.distance != null ? Number(s.distance) : null,
          })),
        })
        .eq('id', entry.exerciseId)
        .eq('user_id', uid)
      if (error) console.error(error)
      continue
    }

    const { error } = await supabase
      .from('exercises')
      .update({
        last_weight: Number(last.weight) || 0,
        last_reps: Number(last.reps),
        last_date: session.date,
        ...noteFields(entry),
        last_sets: completedSets.map((s) => ({
          weight: Number(s.weight) || 0,
          reps: Number(s.reps),
          ...(s.rir !== '' && s.rir != null ? { rir: Number(s.rir) } : {}),
        })),
      })
      .eq('id', entry.exerciseId)
      .eq('user_id', uid)
    if (error) console.error(error)
  }
}

export async function deleteSession(uid, id) {
  // Note which exercises this session touched BEFORE it's gone, so their
  // "previously logged" hint can be recalculated afterwards.
  const { data: existing } = await supabase.from('sessions').select('entries').eq('id', id).eq('user_id', uid).single()
  const { error } = await supabase.from('sessions').delete().eq('id', id).eq('user_id', uid)
  if (error) throw error
  await recomputeLastKnown(uid, (existing?.entries || []).map((e) => e.exerciseId))
}

// Rebuilds the cached "last time you did this" values on an exercise from
// whatever sessions actually exist now.
//
// Those values are a snapshot written when a session is logged, which is
// fine for new sessions but wrong the moment history changes underneath
// them: edit last Monday's bench from 80 to 82.5, or delete a session
// entirely, and the hint kept showing the old number — the very number
// people use to decide what to lift. This recomputes it from the real
// sessions instead.
export async function recomputeLastKnown(uid, exerciseIds) {
  const ids = [...new Set((exerciseIds || []).filter(Boolean))]
  if (ids.length === 0) return

  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('date, created_at, entries')
    .eq('user_id', uid)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error

  for (const exerciseId of ids) {
    let found = null
    for (const s of sessions || []) {
      const entry = (s.entries || []).find((e) => e.exerciseId === exerciseId)
      if (!entry) continue
      const completed = (entry.sets || []).filter((set) => isCompletedSet(entry, set))
      if (completed.length === 0) continue
      found = { session: s, entry, completed }
      break
    }

    // No sessions left for this exercise — clear the hint rather than
    // leaving a number from a workout that no longer exists.
    if (!found) {
      await supabase
        .from('exercises')
        .update({ last_weight: null, last_reps: null, last_distance: null, last_date: null, last_sets: null })
        .eq('id', exerciseId)
        .eq('user_id', uid)
      continue
    }

    const { session, entry, completed } = found
    const last = completed[completed.length - 1]
    const isCardio = entry.category === 'cardio'
    await supabase
      .from('exercises')
      .update({
        last_weight: isCardio ? Number(last.duration) || 0 : Number(last.weight) || 0,
        last_reps: isCardio ? Number(last.intensity) || 0 : Number(last.reps),
        ...(isCardio ? { last_distance: last.distance === '' || last.distance == null ? null : Number(last.distance) } : {}),
        last_date: session.date,
        last_sets: completed.map((s) =>
          isCardio
            ? {
                duration: Number(s.duration) || 0,
                intensity: Number(s.intensity) || 0,
                ...(s.distance === '' || s.distance == null ? {} : { distance: Number(s.distance) }),
              }
            : {
                weight: Number(s.weight) || 0,
                reps: Number(s.reps),
                ...(s.rir !== '' && s.rir != null ? { rir: Number(s.rir) } : {}),
              },
        ),
      })
      .eq('id', exerciseId)
      .eq('user_id', uid)
  }
}

// Trainer feedback on a specific session — kept separate from the
// trainee's own notes. The UI only exposes this to admins, but it rides on
// the existing sessions RLS policy (admin can update any row) rather than
// needing its own.
export async function updateTrainerComment(uid, sessionId, comment) {
  const { error } = await supabase
    .from('sessions')
    .update({ trainer_comment: comment })
    .eq('id', sessionId)
    .eq('user_id', uid)
  if (error) throw error
}

// Editing a past session only touches that session's own row — it
// deliberately does NOT update the "last performance" snapshot on
// exercises, since that should reflect the most recent session overall,
// not whichever one happens to be getting corrected right now.
export async function updateSession(uid, id, patch) {
  const row = {}
  if (patch.date !== undefined) row.date = patch.date
  if (patch.notes !== undefined) row.notes = patch.notes
  if (patch.entries !== undefined) row.entries = cleanEntries(patch.entries)

  // Exercises in the session before the edit, so one removed by the edit
  // still gets its hint recalculated.
  const { data: before } = await supabase.from('sessions').select('entries').eq('id', id).eq('user_id', uid).single()

  const { error } = await supabase.from('sessions').update(row).eq('id', id).eq('user_id', uid)
  if (error) throw error

  const touched = [
    ...(before?.entries || []).map((e) => e.exerciseId),
    ...(row.entries || []).map((e) => e.exerciseId),
  ]
  await recomputeLastKnown(uid, touched)
}

// ---- Body weight tracking ----
export async function addBodyWeightEntry(uid, entry) {
  const { error } = await supabase.from('body_weight_logs').insert({
    user_id: uid,
    date: entry.date,
    weight: Number(entry.weight),
    unit: entry.unit || 'kg',
  })
  if (error) throw error
}

export async function updateBodyWeightEntry(uid, id, patch) {
  const row = {}
  if (patch.date !== undefined) row.date = patch.date
  if (patch.weight !== undefined) row.weight = Number(patch.weight)
  if (patch.unit !== undefined) row.unit = patch.unit
  const { error } = await supabase.from('body_weight_logs').update(row).eq('id', id).eq('user_id', uid)
  if (error) throw error
}

export async function deleteBodyWeightEntry(uid, id) {
  const { error } = await supabase.from('body_weight_logs').delete().eq('id', id).eq('user_id', uid)
  if (error) throw error
}
