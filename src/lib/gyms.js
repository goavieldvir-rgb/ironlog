import { supabase } from '../supabase.js'
import { useCollection, useProfile, isCompletedSet } from './db.js'
import { workingSets } from './warmup.js'

// Gym profiles. The main gym is not a row: a workout with no gym_id (every
// workout logged before this feature, and everything by someone who only
// trains at one gym) is at the main gym. Adding a gym row is what turns the
// gym picker on; with no rows, nothing in the app changes.

// gyms: the extra gyms, oldest first. mainName: the main gym's custom name,
// or null for the default label. enabled: the person trains at 2+ gyms.
export function useGyms(uid) {
  const [gyms, loading, refreshGyms, error] = useCollection(uid, 'gyms', 'created_at', 'asc')
  const [profile, , refreshProfile] = useProfile(uid)
  return {
    gyms,
    loading,
    mainName: profile?.main_gym_name || null,
    enabled: gyms.length > 0,
    // False until the gyms migration has been run (the table is missing).
    available: !loading && !error,
    refresh: () => {
      refreshGyms()
      refreshProfile()
    },
  }
}

// A workout's gym id, with a gym that no longer exists counted as main.
export function sessionGymId(session, gyms) {
  const id = session?.gym_id || null
  return id && gyms.some((g) => g.id === id) ? id : null
}

export function gymLabel(gymId, gyms, mainName, t) {
  if (gymId) {
    const g = gyms.find((x) => x.id === gymId)
    if (g) return g.name
  }
  return mainName || t('gyms.mainDefault')
}

// The "last time" fields for one entry of a session (same shape as the
// cached columns on the exercises row), or null when it has no completed
// working sets.
function lastKnownOf(session, entry) {
  const completed = workingSets(entry.sets).filter((set) => isCompletedSet(entry, set))
  if (completed.length === 0) return null
  const last = completed[completed.length - 1]
  const isCardio = entry.category === 'cardio'
  return {
    last_weight: isCardio ? Number(last.duration) || 0 : Number(last.weight) || 0,
    last_reps: isCardio ? Number(last.intensity) || 0 : Number(last.reps),
    last_distance: isCardio && last.distance !== '' && last.distance != null ? Number(last.distance) : null,
    last_date: session.date,
    last_sets: completed.map((set) =>
      isCardio
        ? {
            duration: Number(set.duration) || 0,
            intensity: Number(set.intensity) || 0,
            ...(set.distance === '' || set.distance == null ? {} : { distance: Number(set.distance) }),
          }
        : {
            weight: Number(set.weight) || 0,
            reps: Number(set.reps),
            ...(set.rir !== '' && set.rir != null ? { rir: Number(set.rir) } : {}),
          },
    ),
  }
}

// One pass over the sessions (newest first): the latest numbers for each
// exercise at each gym, and the latest anywhere with the gym they're from.
// Keys of `atGym` are gym ids, '' for the main gym.
export function gymHistory(sessions, gyms) {
  const atGym = {}
  const any = {}
  for (const s of sessions) {
    const gymKey = sessionGymId(s, gyms) || ''
    const byEx = (atGym[gymKey] ||= {})
    for (const entry of s.entries || []) {
      const id = entry.exerciseId
      if (!id || (byEx[id] && any[id])) continue
      const known = lastKnownOf(s, entry)
      if (!known) continue
      byEx[id] ||= known
      any[id] ||= { ...known, fromGymId: gymKey || null }
    }
  }
  return { atGym, any }
}

// The exercise record as the workout screen should see it at `gymId`: the
// "previous" numbers come from the last workout at that gym. Never done
// there yet: the newest numbers from any gym, with `fromGymId` saying where
// they're from so the card can say so.
export function exerciseAtGym(exercise, history, gymId) {
  const here = history.atGym[gymId || '']?.[exercise.id]
  if (here) return { ...exercise, ...here }
  // Nothing in the loaded workouts: keep the numbers cached on the exercise.
  return { ...exercise, ...history.any[exercise.id] }
}

export async function addGym(uid, name) {
  const { error } = await supabase.from('gyms').insert({ user_id: uid, name: name.trim() })
  if (error) throw error
}

export async function renameGym(uid, id, name) {
  const { error } = await supabase.from('gyms').update({ name: name.trim() }).eq('id', id).eq('user_id', uid)
  if (error) throw error
}

export async function deleteGym(uid, id) {
  const { error } = await supabase.from('gyms').delete().eq('id', id).eq('user_id', uid)
  if (error) throw error
}

export async function renameMainGym(uid, name) {
  const { error } = await supabase
    .from('profiles')
    .update({ main_gym_name: name.trim() || null })
    .eq('id', uid)
  if (error) throw error
}
