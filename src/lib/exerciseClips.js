import { CLIPS } from './clipManifest.js'
import { exerciseKeyFor, normalizeExerciseName } from './demoVideos.js'

// Ironlog's own rendered exercise clips (public/clips, synced from the render
// pipeline by scripts/sync-clips.sh). Each clip has a still for the icon,
// and some have a technique-tips clip too.

// Canonical exercise key (see demoVideos.js) -> clip slug.
const CLIP_BY_KEY = {
  ab_wheel_rollout: 'ab-wheel-rollout',
  arnold_press: 'arnold-press',
  assault_bike: 'assault-air-bike',
  assisted_dips: 'assisted-dips',
  assisted_pull_up: 'assisted-pull-up',
  back_extension: 'back-extension',
  bench_press: 'barbell-bench-press',
  barbell_curl: 'barbell-biceps-curl',
  bench_dips: 'bench-dips',
  cable_curl: 'cable-biceps-curl',
  cable_fly: 'cable-chest-fly-cable-crossover',
  cable_chest_press: 'cable-chest-press',
  cable_crunch: 'cable-crunch',
  cable_lateral_raise: 'cable-lateral-raise',
  cable_overhead_tricep_extension: 'cable-overhead-triceps-extension',
  captains_chair_leg_raise: 'captains-chair-leg-raise',
  chest_press_machine: 'chest-press-machine',
  chest_supported_row: 'chest-supported-row',
  close_grip_lat_pulldown: 'close-grip-lat-pulldown',
  concentration_curl: 'concentration-curl',
  dumbbell_curl: 'dumbbell-biceps-curl',
  lateral_raise: 'dumbbell-lateral-raise',
  overhead_tricep_extension: 'dumbbell-overhead-triceps-extension',
  elliptical: 'elliptical-trainer',
  ez_bar_curl: 'ez-bar-curl',
  hack_squat: 'hack-squat',
  hammer_curl: 'hammer-curl',
  hanging_leg_raise: 'hanging-leg-raise',
  adductor_machine: 'hip-adductor-machine',
  incline_bench_press: 'incline-barbell-bench-press',
  incline_dumbbell_press: 'incline-dumbbell-bench-press',
  incline_smith_press: 'incline-smith-machine-press',
  jump_rope: 'jump-rope',
  lat_pulldown: 'lat-pulldown',
  leg_extension: 'leg-extension',
  leg_press: 'leg-press',
  leg_curl: 'lying-leg-curl',
  machine_lateral_raise: 'machine-lateral-raise',
  machine_shoulder_press: 'machine-shoulder-press',
  machine_single_arm_row: 'machine-single-arm-row',
  dumbbell_row: 'one-arm-dumbbell-row',
  dips: 'parallel-bar-dips',
  pec_deck: 'pec-deck-fly-machine',
  plank: 'plank',
  preacher_curl: 'preacher-curl',
  pull_up: 'pull-up',
  weighted_pull_up: 'pull-up',
  push_up: 'push-up',
  rear_delt_fly: 'rear-delt-fly',
  romanian_deadlift: 'romanian-deadlift',
  scapular_push_up: 'scapular-push-up',
  seated_cable_row: 'seated-cable-row',
  seated_dumbbell_curl: 'seated-dumbbell-curl',
  seated_dumbbell_shoulder_press: 'seated-dumbbell-shoulder-press',
  seated_leg_curl: 'seated-leg-curl',
  single_arm_lat_pulldown: 'single-arm-lat-pulldown',
  split_squat: 'split-squat',
  calf_raise: 'standing-calf-raise',
  static_lunge: 'static-lunge',
  step_down: 'step-down',
  t_bar_row: 't-bar-row',
  treadmill: 'treadmill-running',
  tricep_pushdown: 'triceps-pushdown',
  wall_slide: 'wall-slides',
  wide_grip_lat_pulldown: 'wide-grip-lat-pulldown',
}

const BASE = `${import.meta.env.BASE_URL || './'}clips/`

function clipSlugFor(name) {
  const key = exerciseKeyFor(name)
  if (key && CLIP_BY_KEY[key] && CLIPS[CLIP_BY_KEY[key]]) return CLIP_BY_KEY[key]
  // A library name written exactly like the clip ("Treadmill running").
  const slug = normalizeExerciseName(name).replace(/ /g, '-')
  return CLIPS[slug] ? slug : null
}

// What the coach set on the exercise (exercises.clip): a clip slug, NO_CLIP
// to hide a wrong automatic match, or empty for automatic.
export const NO_CLIP = 'none'

export const CLIP_SLUGS = Object.keys(CLIPS)

// "one-arm-dumbbell-row" -> "One arm dumbbell row"
export function clipLabel(slug) {
  const s = String(slug || '').replace(/-/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function clipBySlug(slug) {
  const entry = CLIPS[slug]
  if (!entry) return null
  return {
    slug,
    video: `${BASE}${slug}.mp4?v=${entry.v}`,
    still: `${BASE}${slug}.jpg?v=${entry.v}`,
    tips: entry.t ? `${BASE}tips/${slug}.mp4?v=${entry.t}` : null,
  }
}

// The clip matched automatically from the first of `names` that has one.
export function autoClipFor(names) {
  for (const n of [].concat(names)) {
    const slug = n ? clipSlugFor(n) : null
    if (slug) return clipBySlug(slug)
  }
  return null
}

// The clip for an exercise: the coach's own choice first, then the
// automatic match by name (English names first; a Hebrew display name
// never matches, which is fine).
//   { slug, video, still, tips } or null
export function exerciseClipFor(chosen, names) {
  if (chosen === NO_CLIP) return null
  return (chosen && clipBySlug(chosen)) || autoClipFor(names)
}
