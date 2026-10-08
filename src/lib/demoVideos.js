import { safeVideoUrl } from './url.js'

// Built-in demo clips: one short, muted, looping YouTube clip per exercise,
// so every exercise shows its example the same way. Keyed by a canonical
// exercise key; ALIASES maps the names people actually have in their
// library onto those keys. An entry with an empty id is "not filled in
// yet" and is treated as no demo at all.
//   { id: 'YOUTUBE_ID', start?: seconds, end?: seconds }
const e = () => ({ id: '' })

export const DEMO_VIDEOS = {
  bench_press: e(),
  incline_bench_press: e(),
  incline_dumbbell_press: e(),
  incline_smith_press: e(),
  chest_press_machine: e(),
  cable_chest_press: e(),
  cable_fly: e(),
  pec_deck: e(),
  push_up: e(),
  scapular_push_up: e(),
  dips: e(),
  bench_dips: e(),
  assisted_dips: e(),
  pull_up: e(),
  weighted_pull_up: e(),
  assisted_pull_up: e(),
  lat_pulldown: e(),
  wide_grip_lat_pulldown: e(),
  close_grip_lat_pulldown: e(),
  single_arm_lat_pulldown: e(),
  seated_cable_row: e(),
  chest_supported_row: e(),
  t_bar_row: e(),
  dumbbell_row: e(),
  machine_single_arm_row: e(),
  back_extension: e(),
  romanian_deadlift: e(),
  leg_press: e(),
  hack_squat: e(),
  leg_extension: e(),
  leg_curl: e(),
  seated_leg_curl: e(),
  adductor_machine: e(),
  calf_raise: e(),
  split_squat: e(),
  static_lunge: e(),
  step_down: e(),
  captains_chair_leg_raise: e(),
  wall_slide: e(),
  barbell_curl: e(),
  dumbbell_curl: e(),
  seated_dumbbell_curl: e(),
  cable_curl: e(),
  ez_bar_curl: e(),
  hammer_curl: e(),
  preacher_curl: e(),
  concentration_curl: e(),
  tricep_pushdown: e(),
  overhead_tricep_extension: e(),
  cable_overhead_tricep_extension: e(),
  lateral_raise: e(),
  cable_lateral_raise: e(),
  machine_lateral_raise: e(),
  rear_delt_fly: e(),
  arnold_press: e(),
  seated_dumbbell_shoulder_press: e(),
  machine_shoulder_press: e(),
  cable_crunch: e(),
  hanging_leg_raise: e(),
  plank: e(),
  ab_wheel_rollout: e(),
  treadmill: e(),
  elliptical: e(),
  assault_bike: e(),
  jump_rope: e(),
}

// Lowercase, trimmed, single-spaced, with hyphens and en/em dashes read as
// spaces. No stemming — plurals and spelling variants are listed in
// ALIASES by hand, so a match is never a surprise.
// Em dash is treated like the en dash, so "Assault bike — cardio session"
// still reads as plain words.
export function normalizeExerciseName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Keys are written already normalized (hyphens as spaces).
const ALIASES = {
  'ab wheel rollout': 'ab_wheel_rollout',
  'ab wheel': 'ab_wheel_rollout',
  'adductor machine': 'adductor_machine',
  'hip adductor': 'adductor_machine',
  'assault bike': 'assault_bike',
  'assault bike cardio session': 'assault_bike',
  'arnold press': 'arnold_press',
  'assisted dips': 'assisted_dips',
  'assisted dip': 'assisted_dips',
  'assisted pull up': 'assisted_pull_up',
  'assisted pull ups': 'assisted_pull_up',
  'assisted pullup': 'assisted_pull_up',
  'assisted pullups': 'assisted_pull_up',
  'gravitator pullups': 'assisted_pull_up',
  'gravitator pull ups': 'assisted_pull_up',
  'back extension': 'back_extension',
  'back extensions': 'back_extension',
  'bench dips': 'bench_dips',
  'bench dip': 'bench_dips',
  'bench press': 'bench_press',
  'barbell bench press': 'bench_press',
  'bicep curl': 'dumbbell_curl',
  'bicep curls': 'dumbbell_curl',
  'biceps curl': 'dumbbell_curl',
  'bicep curl seated dumbbells': 'seated_dumbbell_curl',
  'bicep short head': 'concentration_curl',
  'cable chest fly': 'cable_fly',
  'cable fly': 'cable_fly',
  'cable flyes': 'cable_fly',
  'cable chest press': 'cable_chest_press',
  'cable crunch': 'cable_crunch',
  'cable curl': 'cable_curl',
  'cable lateral raise': 'cable_lateral_raise',
  'cable overhead tricep extension': 'cable_overhead_tricep_extension',
  'calf raise': 'calf_raise',
  'calf raises': 'calf_raise',
  'chest press machine': 'chest_press_machine',
  'machine chest press': 'chest_press_machine',
  'chest supported row': 'chest_supported_row',
  'close grip lat pulldown': 'close_grip_lat_pulldown',
  'curls': 'dumbbell_curl',
  'dumbbell curl': 'dumbbell_curl',
  'dumbbell curls': 'dumbbell_curl',
  'dumbbell row': 'dumbbell_row',
  'dumbbell rows': 'dumbbell_row',
  'one arm db row': 'dumbbell_row',
  'one arm dumbbell row': 'dumbbell_row',
  'single arm dumbbell row': 'dumbbell_row',
  'elliptical': 'elliptical',
  'elliptical trainer': 'elliptical',
  'ez bar curl': 'ez_bar_curl',
  'hack squat': 'hack_squat',
  'hammer curl': 'hammer_curl',
  'hammer curls': 'hammer_curl',
  'hanging leg raise': 'hanging_leg_raise',
  'hanging leg raises': 'hanging_leg_raise',
  'incline bench press': 'incline_bench_press',
  'incline dumbbell bench press': 'incline_dumbbell_press',
  'incline dumbbell press': 'incline_dumbbell_press',
  'incline smith machine press': 'incline_smith_press',
  'incline smith press': 'incline_smith_press',
  'jump rope': 'jump_rope',
  'jumping rope': 'jump_rope',
  'skipping rope': 'jump_rope',
  'lat pulldown': 'lat_pulldown',
  'lat pull down': 'lat_pulldown',
  'lateral raise': 'lateral_raise',
  'lateral raises': 'lateral_raise',
  'dumbbell lateral raise': 'lateral_raise',
  'dumbbell lateral raises': 'lateral_raise',
  'leg curl': 'leg_curl',
  'leg curls': 'leg_curl',
  'leg extension': 'leg_extension',
  'leg extensions': 'leg_extension',
  'leg press': 'leg_press',
  'machine lateral raise': 'machine_lateral_raise',
  'machine shoulder press': 'machine_shoulder_press',
  'machine single arm row': 'machine_single_arm_row',
  'overhead tricep extension': 'overhead_tricep_extension',
  'overhead triceps extension': 'overhead_tricep_extension',
  'parallel bar dips': 'dips',
  'parallel dips': 'dips',
  'dips': 'dips',
  'dip': 'dips',
  'pec deck': 'pec_deck',
  'pec deck fly': 'pec_deck',
  'pec deck fly machine': 'pec_deck',
  'plank': 'plank',
  'preacher curl': 'preacher_curl',
  'preacher curls': 'preacher_curl',
  'pull up': 'pull_up',
  'pull ups': 'pull_up',
  'pullup': 'pull_up',
  'pullups': 'pull_up',
  'push up': 'push_up',
  'push ups': 'push_up',
  'pushup': 'push_up',
  'pushups': 'push_up',
  'rdl': 'romanian_deadlift',
  'romanian deadlift': 'romanian_deadlift',
  'rear delt fly': 'rear_delt_fly',
  'rear delt flyes': 'rear_delt_fly',
  'reverse fly': 'rear_delt_fly',
  'rome chair legs': 'captains_chair_leg_raise',
  'captains chair leg raise': 'captains_chair_leg_raise',
  "captain's chair leg raise": 'captains_chair_leg_raise',
  'running': 'treadmill',
  'scapular push up': 'scapular_push_up',
  'scapular push ups': 'scapular_push_up',
  'scapular pushup': 'scapular_push_up',
  'scapular pushups': 'scapular_push_up',
  'seated cable row': 'seated_cable_row',
  'seated dumbbell curl': 'seated_dumbbell_curl',
  'seated dumbbell curls': 'seated_dumbbell_curl',
  'seated dumbbell shoulder press': 'seated_dumbbell_shoulder_press',
  'seated leg curl': 'seated_leg_curl',
  'single arm lat pull down': 'single_arm_lat_pulldown',
  'single arm lat pulldown': 'single_arm_lat_pulldown',
  'split squat': 'split_squat',
  'split squats': 'split_squat',
  'static lunge': 'static_lunge',
  'static lunges': 'static_lunge',
  'step down': 'step_down',
  'step downs': 'step_down',
  't bar row': 't_bar_row',
  'treadmill': 'treadmill',
  'tricep extensions': 'overhead_tricep_extension',
  'tricep extension': 'overhead_tricep_extension',
  'triceps extension': 'overhead_tricep_extension',
  'tricep pushdown': 'tricep_pushdown',
  'tricep pushdowns': 'tricep_pushdown',
  'triceps pushdown': 'tricep_pushdown',
  'triceps pushdowns': 'tricep_pushdown',
  'wall slide': 'wall_slide',
  'wall slides': 'wall_slide',
  'weighted pull up': 'weighted_pull_up',
  'weighted pullup': 'weighted_pull_up',
  'wheighted pullup': 'weighted_pull_up',
  'wheighted pull up': 'weighted_pull_up',
  'wide grip lat pulldown': 'wide_grip_lat_pulldown',
  'barbell curl': 'barbell_curl',
  'barbell curls': 'barbell_curl',
  'concentration curl': 'concentration_curl',
  'concentration curls': 'concentration_curl',
}

// The demo entry for an exercise name, or null when there's no alias or no
// clip has been filled in for it yet.
export function demoVideoFor(name) {
  const norm = normalizeExerciseName(name)
  const key = ALIASES[norm] || (DEMO_VIDEOS[norm.replace(/ /g, '_')] ? norm.replace(/ /g, '_') : null)
  const demo = key ? DEMO_VIDEOS[key] : null
  return demo && demo.id ? demo : null
}

const YT_HOSTS = /^(www\.|m\.|music\.)?youtube(-nocookie)?\.com$/i
const YT_ID = /^[A-Za-z0-9_-]{11}$/

// The 11-character video id from any of the usual YouTube link shapes, or
// null for anything else.
export function youtubeIdFromUrl(url) {
  const raw = String(url || '').trim()
  if (!raw) return null
  let u
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return null
  }
  const host = u.hostname.toLowerCase()
  let id = null
  if (host === 'youtu.be' || host === 'www.youtu.be') {
    id = u.pathname.split('/')[1]
  } else if (YT_HOSTS.test(host)) {
    const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/)
    if (m) id = m[1]
    else if (u.pathname === '/watch') id = u.searchParams.get('v')
  }
  return id && YT_ID.test(id) ? id : null
}

// Muted autoplay that loops (YouTube only loops when playlist = the same
// id), with related videos and branding kept quiet. nocookie so nothing is
// tracked until the clip is actually opened.
export function youtubeEmbedUrl(id, { start, end } = {}) {
  const p = new URLSearchParams({
    autoplay: '1',
    mute: '1',
    playsinline: '1',
    loop: '1',
    playlist: id,
    rel: '0',
    modestbranding: '1',
  })
  if (Number.isFinite(start) && start > 0) p.set('start', String(Math.floor(start)))
  if (Number.isFinite(end) && end > 0) p.set('end', String(Math.floor(end)))
  return `https://www.youtube-nocookie.com/embed/${id}?${p.toString()}`
}

// What the "Example" button should do for one exercise. A coach's own link
// always wins over the built-in clip.
export function resolveExerciseVideo({ name, videoUrl }) {
  const own = String(videoUrl || '').trim()
  if (own) {
    const id = youtubeIdFromUrl(own)
    if (id) return { kind: 'embed', id }
    const url = safeVideoUrl(own)
    return url ? { kind: 'link', url } : null
  }
  const demo = demoVideoFor(name)
  return demo ? { kind: 'embed', id: demo.id, start: demo.start, end: demo.end, builtIn: true } : null
}
