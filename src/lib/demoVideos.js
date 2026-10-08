import { safeVideoUrl } from './url.js'

// Built-in demo clips: one short, muted, looping YouTube clip per exercise,
// so every exercise shows its example the same way. Keyed by a canonical
// exercise key; ALIASES maps the names people actually have in their
// library onto those keys. An entry with an empty id is "not filled in
// yet" and is treated as no demo at all.
//   { id: 'YOUTUBE_ID', start?: seconds, end?: seconds }

export const DEMO_VIDEOS = {
  bench_press: { id: 'rT7DgCr-3pg' }, // ScottHermanFitness
  incline_bench_press: { id: 'SrqOu55lrYU' }, // ScottHermanFitness
  incline_dumbbell_press: { id: 'hChjZQhX1Ls' }, // ScottHermanFitness
  incline_smith_press: { id: 'pd2fnOrggI8' }, // MyTraining App
  chest_press_machine: { id: 'ksTNcvc6sKs' }, // Rehab My Patient
  cable_chest_press: { id: 'N2RB0Qvab7o' }, // Live Lean TV Daily Exercises
  cable_fly: { id: '8Um35Es-ROE' }, // ScottHermanFitness
  pec_deck: { id: '-DZXcuPi4vk' }, // Live Lean TV Daily Exercises
  push_up: { id: 'vh72hbUqqfs' }, // ScottHermanFitness
  scapular_push_up: { id: 'Ng-iiDUd_fs' }, // SaturnoMovement
  dips: { id: '8UugSoVJLag' }, // ScottHermanFitness
  bench_dips: { id: 'n6F4t5PHEmM' }, // Rachel Scheer
  assisted_dips: { id: 'kbmVlw-i0Vs' }, // Travis Tarrant
  pull_up: { id: 'ylVmNQlKdAI' }, // ScottHermanFitness
  weighted_pull_up: { id: 'ylVmNQlKdAI' }, // ScottHermanFitness
  assisted_pull_up: { id: 'gnElpp3Fm50' }, // All Strong Fitness
  lat_pulldown: { id: 'CAwf7n6Luuc' }, // ScottHermanFitness
  wide_grip_lat_pulldown: { id: '7JnP8dFbS14' }, // PureGym
  close_grip_lat_pulldown: { id: 'IjoFCmLX7z0' }, // PureGym
  single_arm_lat_pulldown: { id: 'nav4bUA3QZM' }, // Live Lean TV Daily Exercises
  seated_cable_row: { id: 'GZbfZ033f74' }, // ScottHermanFitness
  chest_supported_row: { id: 'QpLTp2AJ_cI' }, // Fox Body Fitness
  t_bar_row: { id: 'j3Igk5nyZE4' }, // ScottHermanFitness
  dumbbell_row: { id: 'sUqz6oaISkQ' }, // ScottHermanFitness
  machine_single_arm_row: { id: '0GDPa0w2_k0' }, // Fitness Lab
  back_extension: { id: 'CgbmrF-DRSE' }, // Enterprise Fitness
  romanian_deadlift: { id: '2SHsk9AzdjA' }, // Buff Dudes
  leg_press: { id: 'IZxyjW7MPJQ' }, // ScottHermanFitness
  hack_squat: { id: 'plv5ur26Q7A' }, // Bodybuilding.com
  leg_extension: { id: 'gI0cn4DMFFI' }, // Live Lean TV Daily Exercises
  leg_curl: { id: '5Uvvd6NsCyU' }, // Live Lean TV Daily Exercises
  seated_leg_curl: { id: 'jq03iefZxjc' }, // PartnerMD
  adductor_machine: { id: 'fpVHoidfg60' }, // Live Lean TV Daily Exercises
  calf_raise: { id: '3UWi44yN-wM' }, // ScottHermanFitness
  split_squat: { id: '5VG4UnfA7Bk' }, // Steev
  bulgarian_split_squat: { id: '2C-uNgKwPLE' }, // ScottHermanFitness
  static_lunge: { id: 'T2s9nByxqvk' }, // Get Healthy U - with Chris Freytag
  step_down: { id: 'Or4C-UQ63Xc' }, // Dr. Carl Baird
  captains_chair_leg_raise: { id: '7KDDZtaUaxw' }, // Live Lean TV Daily Exercises
  wall_slide: { id: 'D351y9ecIwc' }, // MGHOrthopaedics
  barbell_curl: { id: 'QZEqB6wUPxQ' }, // ScottHermanFitness
  dumbbell_curl: { id: 'w7hl4IbHMtY' }, // Live Lean TV Daily Exercises
  seated_dumbbell_curl: { id: 's9GGVuUXgmY' }, // Live Lean TV Daily Exercises
  cable_curl: { id: '_hRnRorKRWs' }, // Live Lean TV Daily Exercises
  ez_bar_curl: { id: 'wGi7k6JGs1k' }, // No Pain Project
  hammer_curl: { id: 'zC3nLlEvin4' }, // ScottHermanFitness
  preacher_curl: { id: 'RgN216Cumtw' }, // Bodybuilding.com
  concentration_curl: { id: 'ZcU2hN76UyA' }, // Bodybuilding.com
  tricep_pushdown: { id: '2-LAMcpzODU' }, // ScottHermanFitness
  overhead_tricep_extension: { id: 'YbX7Wd8jQ-Q' }, // ScottHermanFitness
  cable_overhead_tricep_extension: { id: 'mRozZKkGIfg' }, // Bodybuilding.com
  lateral_raise: { id: 'XPPfnSEATJA' }, // National Academy of Sports Medicine (NASM)
  cable_lateral_raise: { id: 'Z9KwFXXxkKQ' }, // Live Lean TV Daily Exercises
  machine_lateral_raise: { id: 'dTwa2piwU-A' }, // Live Lean TV Daily Exercises
  rear_delt_fly: { id: 'hmtnyIGgR9A' }, // Ignore Limits
  arnold_press: { id: 'ZsVxV2dV5YU' }, // Live Lean TV Daily Exercises
  seated_dumbbell_shoulder_press: { id: '8kwDkC8JhdY' }, // Live Lean TV Daily Exercises
  machine_shoulder_press: { id: 'Anu8s_nkNpM' }, // Live Lean TV Daily Exercises
  cable_crunch: { id: 'kc0PRn372lo' }, // Live Lean TV Daily Exercises
  hanging_leg_raise: { id: 'Nw0LOKe3_l8' }, // Bodybuilding.com
  plank: { id: 'pvIjsG5Svck' }, // Children's Hospital Colorado
  ab_wheel_rollout: { id: 'trOxwfSlFFo' }, // Tom Houpt
  treadmill: { id: '76XnbF5DBFY' }, // Global Triathlon Network
  elliptical: { id: 'mNM01g9wLy4' }, // LIVESTRONG
  assault_bike: { id: 'RPY7HTGfOiU' }, // Peak Human Performance
  jump_rope: { id: 'Y3wzaWE9QRY' }, // Karina Inkster
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
  'bulgarian split squat': 'bulgarian_split_squat',
  'bulgarian split squats': 'bulgarian_split_squat',
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
    // embed/videoseries is a playlist, not a video: left as a plain link.
    const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/)
    if (m) id = m[1]
    else if (u.pathname === '/watch') id = u.searchParams.get('v')
  }
  return id && YT_ID.test(id) && id !== 'videoseries' ? id : null
}

// A shared link's own start time ("t=95", "t=95s", "start=95", "t=1m35s"),
// in seconds, or undefined.
export function youtubeStartFromUrl(url) {
  let u
  try {
    const raw = String(url || '').trim()
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return undefined
  }
  const v = u.searchParams.get('t') || u.searchParams.get('start') || (u.hash.match(/t=([^&]+)/) || [])[1]
  if (!v) return undefined
  const m = String(v).match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/)
  if (!m || !m[0]) return undefined
  const secs = (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0)
  return secs > 0 ? secs : undefined
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
    if (id) return { kind: 'embed', id, start: youtubeStartFromUrl(own) }
    const url = safeVideoUrl(own)
    return url ? { kind: 'link', url } : null
  }
  const demo = demoVideoFor(name)
  return demo ? { kind: 'embed', id: demo.id, start: demo.start, end: demo.end, builtIn: true } : null
}
