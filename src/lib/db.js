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

// ---- Exercises ----
export async function addExercise(uid, exercise) {
  const { data, error } = await supabase
    .from('exercises')
    .insert({
      user_id: uid,
      name: exercise.name,
      category: exercise.category || 'strength', // 'strength' | 'mobility' | 'cardio'
      video_url: exercise.videoUrl || '',
      notes: exercise.notes || '',
      unit: exercise.unit || 'kg', // weight unit, or distance unit (km/mi) for cardio
      bodyweight: !!exercise.bodyweight,
      intensity_type: exercise.intensityType || 'rpe', // 'rpe' | 'hr_zone', cardio only
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
  const { error } = await supabase.from('exercises').update(row).eq('id', id).eq('user_id', uid)
  if (error) throw error
}

export async function deleteExercise(uid, id) {
  const { error } = await supabase.from('exercises').delete().eq('id', id).eq('user_id', uid)
  if (error) throw error
}

// ---- Routines ----
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

// ---- Sessions (a completed workout log) ----
export async function logSession(uid, session) {
  const { error: sessionError } = await supabase.from('sessions').insert({
    user_id: uid,
    routine_id: session.routineId || null,
    routine_name: session.routineName || 'Freestyle',
    category: session.category || 'strength',
    date: session.date,
    notes: session.notes || '',
    entries: session.entries,
  })
  if (sessionError) throw sessionError

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
        last_sets: completedSets.map((s) => ({ weight: Number(s.weight) || 0, reps: Number(s.reps) })),
      })
      .eq('id', entry.exerciseId)
      .eq('user_id', uid)
    if (error) console.error(error)
  }
}

export async function deleteSession(uid, id) {
  const { error } = await supabase.from('sessions').delete().eq('id', id).eq('user_id', uid)
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
  if (patch.entries !== undefined) row.entries = patch.entries
  const { error } = await supabase.from('sessions').update(row).eq('id', id).eq('user_id', uid)
  if (error) throw error
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
