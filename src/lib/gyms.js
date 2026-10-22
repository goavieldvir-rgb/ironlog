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
  const [gyms, loading, refreshGyms] = useCollection(uid, 'gyms', 'created_at', 'asc')
  const [profile, , refreshProfile] = useProfile(uid)
  return {
    gyms,
    loading,
    mainName: profile?.main_gym_name || null,
    enabled: gyms.length > 0,
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

// The "last time" fields for an exercise (same shape as the cached columns
// on the exercises row), from the newest session in `sessions` that has
// completed working sets for it. Sessions must be newest first.
export function lastKnownFrom(sessions, exerciseId) {
  for (const s of sessions) {
    const entry = (s.entries || []).find((e) => e.exerciseId === exerciseId)
    if (!entry) continue
    const completed = workingSets(entry.sets).filter((set) => isCompletedSet(entry, set))
    if (completed.length === 0) continue
    const last = completed[completed.length - 1]
    const isCardio = entry.category === 'cardio'
    return {
      last_weight: isCardio ? Number(last.duration) || 0 : Number(last.weight) || 0,
      last_reps: isCardio ? Number(last.intensity) || 0 : Number(last.reps),
      last_distance: isCardio && last.distance !== '' && last.distance != null ? Number(last.distance) : null,
      last_date: s.date,
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
  return null
}

const NO_HISTORY = { last_weight: null, last_reps: null, last_distance: null, last_date: null, last_sets: null }

// The exercise record as the workout screen should see it at `gymId`: the
// "previous" numbers come from the last workout at that gym. Never done
// there yet: the newest numbers from any gym, with `fromGymId` saying where
// they're from so the card can say so.
export function exerciseAtGym(exercise, sessions, gymId, gyms) {
  const here = sessions.filter((s) => sessionGymId(s, gyms) === gymId)
  const atGym = lastKnownFrom(here, exercise.id)
  if (atGym) return { ...exercise, ...atGym }
  for (const s of sessions) {
    const known = lastKnownFrom([s], exercise.id)
    if (known) return { ...exercise, ...known, fromGymId: sessionGymId(s, gyms) }
  }
  return { ...exercise, ...NO_HISTORY }
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
