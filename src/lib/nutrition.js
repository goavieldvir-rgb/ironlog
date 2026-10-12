import { supabase } from '../supabase.js'
import { normalizeHe, searchTextFor } from './foodText.js'

// Nutrition diary: pure helpers (text normalising, macro maths) and plain
// async data functions. Every data function throws on a Supabase error.

export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack']
export const MEAL_KEY = {
  breakfast: 'nutrition.mealBreakfast',
  lunch: 'nutrition.mealLunch',
  dinner: 'nutrition.mealDinner',
  snack: 'nutrition.mealSnack',
}

// ---------------------------------------------------------------- text

// normalizeHe / searchTextFor live in foodText.js (no Supabase import) so
// the Tzameret import script can compute search_text exactly like the app.
export { normalizeHe, searchTextFor }

const HE_PREFIXES = 'הבלומשכ'

// One entry per word; each entry lists the spellings to try (the word, and
// the word without a one-letter Hebrew prefix such as ב/ל/ה/ו).
export function searchTerms(query) {
  return normalizeHe(query)
    .split(' ')
    .map((w) => w.replace(/[,()%_*"\\:]/g, ''))
    .filter(Boolean)
    .map((w) => {
      const alts = [w]
      if (w.length > 3 && HE_PREFIXES.includes(w[0])) alts.push(w.slice(1))
      return alts
    })
}

const SOURCE_RANK = { coach: 0, moh: 1, off: 2, user: 3 }

export function sortFoods(foods) {
  return [...foods].sort(
    (a, b) =>
      Number(!!b.verified) - Number(!!a.verified) ||
      (SOURCE_RANK[a.source] ?? 9) - (SOURCE_RANK[b.source] ?? 9),
  )
}

const HEBREW = /[\u0590-\u05FF]/

export function foodName(food, lang) {
  const first = lang === 'he' ? food.name_he : food.name_en
  const second = lang === 'he' ? food.name_en : food.name_he
  return (first && first.trim()) || (second && second.trim()) || food.brand || ''
}

export function unitLabel(u, lang) {
  return (lang === 'he' ? u.he || u.en : u.en || u.he) || ''
}

// 'coach' = brass "verified" badge, 'moh', 'off' or 'user' (unverified)
export function badgeKind(food) {
  if (food.source === 'moh') return 'moh'
  if (food.verified) return 'coach'
  if (food.source === 'off') return 'off'
  return 'user'
}

// ---------------------------------------------------------------- maths

export function round1(n) {
  return Math.round((Number(n) || 0) * 10) / 10
}

export function scaleMacros(per, grams) {
  const r = (Number(grams) || 0) / 100
  return {
    kcal: round1(per.kcal * r),
    protein: round1(per.protein * r),
    carbs: round1(per.carbs * r),
    fat: round1(per.fat * r),
  }
}

export function sumLogs(rows) {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  for (const r of rows) {
    t.kcal += Number(r.kcal) || 0
    t.protein += Number(r.protein) || 0
    t.carbs += Number(r.carbs) || 0
    t.fat += Number(r.fat) || 0
  }
  return t
}

// "12.5" -> 12.5 ; "12,5" -> 12.5 ; junk -> NaN
export function parseNum(v) {
  if (typeof v === 'number') return v
  return parseFloat(String(v ?? '').replace(',', '.'))
}

export function fmt(n, d = 0) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return Number(v.toFixed(d)).toLocaleString('en-US', { maximumFractionDigits: d })
}

// Suggests whether label numbers hang together. Returns null when fine, or
// { kind: 'kcal', est } / { kind: 'macros' }.
export function sanityCheck({ kcal, protein, carbs, fat }) {
  const k = Number(kcal) || 0
  const p = Number(protein) || 0
  const c = Number(carbs) || 0
  const f = Number(fat) || 0
  if (p > 100 || c > 100 || f > 100 || p + c + f > 100) return { kind: 'macros' }
  const est = 4 * p + 4 * c + 9 * f
  if (Math.abs(est - k) > Math.max(20, 0.15 * k)) return { kind: 'kcal', est: Math.round(est / 5) * 5 }
  return null
}

// ---------------------------------------------------------------- units

// Options shown in the unit picker: the food's own household units first,
// then grams and 100 g. `def` is the quantity chosen when the unit is picked.
export function buildUnitOptions(food, lang, t) {
  const own = (Array.isArray(food.units) ? food.units : [])
    .filter((u) => Number(u?.g) > 0)
    .map((u, i) => ({ key: `u${i}`, kind: 'unit', label: unitLabel(u, lang), g: Number(u.g), def: 1, step: 0.5 }))
  return [
    ...own,
    { key: 'g', kind: 'g', label: t('nutrition.grams'), g: 1, def: 100, step: 10 },
    { key: '100g', kind: '100g', label: t('nutrition.hundredG'), g: 100, def: 1, step: 0.5 },
  ]
}

export function defaultUnitIndex(options) {
  const i = options.findIndex((o) => o.kind === 'unit')
  return i >= 0 ? i : options.findIndex((o) => o.kind === 'g')
}

export function foodLogRow({ uid, date, meal, food, lang, option, qty }) {
  const q = Number(qty)
  const grams = round1(q * option.g)
  const m = scaleMacros(food, grams)
  return {
    user_id: uid,
    date,
    meal,
    food_id: food.id || null,
    name: foodName(food, lang) || '—',
    grams,
    unit_label: option.kind === 'unit' ? option.label : null,
    unit_qty: option.kind === 'unit' ? q : null,
    ...m,
  }
}

// "2 medium slices · 68 g" / "200 g" / null for quick adds
export function amountText(row, gLabel) {
  if (row.grams == null) return ''
  const g = `${fmt(row.grams, row.grams % 1 ? 1 : 0)} ${gLabel}`
  if (row.unit_label && row.unit_qty != null) return `${fmt(row.unit_qty, 2)} ${row.unit_label} · ${g}`
  return g
}

// ---------------------------------------------------------------- errors

// Turns a Supabase/PostgREST error into a translated sentence.
export function friendlyError(err, t, fallbackKey = 'nutrition.saveFailed') {
  const code = err?.code || ''
  const msg = String(err?.message || '')
  if (
    code === '42P01' ||
    code === 'PGRST205' ||
    code === 'PGRST200' ||
    /relation .* does not exist|schema cache|Could not find the table/i.test(msg)
  ) {
    return t('nutrition.notSetUp')
  }
  if (code === '23514') return t('nutrition.outOfRange')
  return t(fallbackKey)
}

export function isNotSetUp(err) {
  const code = err?.code || ''
  return code === '42P01' || code === 'PGRST205' || /relation .* does not exist|schema cache|Could not find the table/i.test(String(err?.message || ''))
}

function check({ data, error }) {
  if (error) throw error
  return data
}

// ---------------------------------------------------------------- diary

export async function getLogs(uid, date) {
  return check(
    await supabase.from('food_logs').select('*').eq('user_id', uid).eq('date', date).order('created_at', { ascending: true }),
  )
}

export async function insertLogs(rows) {
  if (!rows.length) return []
  return check(await supabase.from('food_logs').insert(rows).select())
}

export async function updateLog(id, patch) {
  return check(await supabase.from('food_logs').update(patch).eq('id', id).select().single())
}

export async function deleteLogs(ids) {
  if (!ids.length) return
  check(await supabase.from('food_logs').delete().in('id', ids))
}

// Distinct recent foods (by food_id, or name for quick adds), newest first.
export async function getRecentLogs(uid, limit = 20) {
  const rows = check(
    await supabase.from('food_logs').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(200),
  )
  const seen = new Set()
  const out = []
  for (const r of rows) {
    const key = r.food_id ? `f:${r.food_id}` : `n:${String(r.name).toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(r)
    if (out.length >= limit) break
  }
  return out
}

// Copies of existing log rows for another day/meal (fresh rows, no id).
export function cloneLogs(rows, { uid, date, meal }) {
  return rows.map((r) => ({
    user_id: uid,
    date,
    meal: meal || r.meal,
    food_id: r.food_id ?? null,
    name: r.name,
    grams: r.grams ?? null,
    unit_label: r.unit_label ?? null,
    unit_qty: r.unit_qty ?? null,
    kcal: r.kcal,
    protein: r.protein,
    carbs: r.carbs,
    fat: r.fat,
  }))
}

// ---------------------------------------------------------------- targets

export async function getTargets(uid) {
  return check(await supabase.from('nutrition_targets').select('*').eq('user_id', uid).maybeSingle())
}

export async function saveTargets(uid, t) {
  return check(
    await supabase
      .from('nutrition_targets')
      .upsert({ user_id: uid, ...t, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      .select()
      .single(),
  )
}

// ---------------------------------------------------------------- saved meals

export async function getSavedMeals(uid) {
  return check(await supabase.from('saved_meals').select('*').eq('user_id', uid).order('created_at', { ascending: false }))
}

export async function saveMeal(uid, name, logs) {
  const items = logs.map((r) => ({
    food_id: r.food_id ?? null,
    name: r.name,
    grams: r.grams ?? null,
    unit_label: r.unit_label ?? null,
    unit_qty: r.unit_qty ?? null,
    kcal: r.kcal,
    protein: r.protein,
    carbs: r.carbs,
    fat: r.fat,
  }))
  return check(await supabase.from('saved_meals').insert({ user_id: uid, name, items }).select().single())
}

export async function deleteSavedMeal(id) {
  check(await supabase.from('saved_meals').delete().eq('id', id))
}

// ---------------------------------------------------------------- foods

// ---- ranking (client side). The query fetches a wide, unordered-by-relevance
// candidate set; these helpers pick the best RESULT_LIMIT of it.
const FETCH_LIMIT = 200
const RESULT_LIMIT = 30
// Processed/derived variants lose ties against the plain food ("ביצה שלמה"
// before "ביצה חלמון מיובש", "אורז לבן" before "קמח אורז").
// Tokens are compared after normalizeHe, so the set is normalized too
// (final letters folded). "white" is left out: Tzameret names plain foods
// "Rice, white, cooked".
const DERIVED = new Set(
  ['מיובש', 'מיובשת', 'מטוגן', 'מטוגנת', 'קפוא', 'חביתה', 'קמח', 'פודינג', 'עוגה', 'עוגת', 'חלבון', 'חלמון', 'תרנגול', 'שניצל', 'סלט', 'נקניק', 'פסטרמה', 'מרק', 'פאי', 'במילוי', 'shnitzel', 'salad', 'pastrami', 'soup', 'pie', 'ציפס', 'טוגנים', 'בבלילה', 'chips', 'coated', 'dried', 'fried', 'frozen', 'omelet', 'omelette', 'flour', 'pudding', 'cake', 'yolk'].map(normalizeHe),
)
const TOKEN_SPLIT = /[\s,;:.()/\\\-+%*]+/

const stripPrefix = (w) => (w.length > 3 && HE_PREFIXES.includes(w[0]) ? w.slice(1) : w)

function nameTokens(name) {
  return normalizeHe(name).split(TOKEN_SPLIT).filter(Boolean)
}

// 0 exact name, 1 name starts with the query, 2 every word starts a word in
// the first two comma segments, 3 same anywhere in the name (a one-letter
// Hebrew prefix is allowed), 4 plain substring.
function matchTier(name, qNorm, qWords) {
  const n = normalizeHe(name)
  if (!n) return 9
  const flat = n.replace(/[,;:.()]/g, ' ').replace(/\s+/g, ' ').trim()
  if (flat === qNorm) return 0
  if (flat.startsWith(qNorm) || flat.startsWith(stripPrefix(qNorm))) return 1
  const toks = nameTokens(name)
  const atStart = (w, toks) => {
    const ws = stripPrefix(w) // "בקוטג" also counts as "קוטג", as in searchTerms
    return toks.some((t) => [w, ws].some((x) => t.startsWith(x) || (t.length > 1 && HE_PREFIXES.includes(t[0]) && t.slice(1).startsWith(x))))
  }
  // Words in the first two comma segments describe the food itself; later
  // segments are usually preparation or brand ("..., אפוי, עוף טוב").
  const head = nameTokens(normalizeHe(name).split(',').slice(0, 2).join(' '))
  if (qWords.every((w) => atStart(w, head))) return 2
  if (qWords.every((w) => atStart(w, toks))) return 3
  return 4
}

export function rankFoods(foods, query, limit = RESULT_LIMIT) {
  const qNorm = normalizeHe(query).replace(/[,()%_*"\\:]/g, '').replace(/\s+/g, ' ').trim()
  const qWords = qNorm.split(' ').filter(Boolean)
  const he = HEBREW.test(qNorm)
  const scored = foods.map((f) => {
    const names = he ? [f.name_he, f.name_en] : [f.name_en, f.name_he]
    const primary = names.filter(Boolean)
    const tier = Math.min(9, ...primary.map((nm) => matchTier(nm, qNorm, qWords)))
    const best = primary.find((nm) => matchTier(nm, qNorm, qWords) === tier) || ''
    const toks = nameTokens(best)
    return {
      f,
      tier,
      derived: toks.some((t) => DERIVED.has(t)) ? 1 : 0,
      words: toks.length,
      rank: (f.verified ? 0 : 10) + (SOURCE_RANK[f.source] ?? 9),
      len: best.length,
    }
  })
  // "Starts with the query" and "a word starts with it near the front" are
  // one band, so a plain Ministry food ("גבינת קוטג' 5%") is not beaten by a
  // branded product whose name happens to start with the word.
  const band = (tier) => (tier === 2 ? 1 : tier)
  scored.sort((a, b) => band(a.tier) - band(b.tier) || a.derived - b.derived || a.words - b.words || a.rank - b.rank || a.len - b.len)
  return scored.slice(0, limit).map((x) => x.f)
}

export async function searchFoods(query) {
  const terms = searchTerms(query)
  if (!terms.length) return []
  let q = supabase.from('foods').select('*')
  for (const alts of terms) q = q.or(alts.map((a) => `search_text.ilike.%${a}%`).join(','))
  // The wide query can match a thousand rows ("שמן", "עוף") and is cut at
  // FETCH_LIMIT before ranking, so also fetch the names that start with the
  // query or have a word that does; those are the best matches.
  const head = terms.map((alts) => alts[0]).join(' ')
  const raw = String(query).trim().replace(/[,()%_*"\\:]/g, '')
  const [wide, starts] = await Promise.all([
    q.order('verified', { ascending: false }).order('source', { ascending: true }).limit(FETCH_LIMIT),
    supabase
      .from('foods')
      .select('*')
      .or(`search_text.ilike."${head}%",search_text.ilike."% ${head}%",name_en.ilike."${raw}%"`)
      .limit(FETCH_LIMIT),
  ])
  const rows = check(wide)
  const ids = new Set(rows.map((r) => r.id))
  for (const r of check(starts)) if (!ids.has(r.id)) rows.push(r)
  return rankFoods(rows, query)
}

export async function findFoodsByBarcode(code) {
  const rows = check(await supabase.from('foods').select('*').eq('barcode', code).limit(10))
  return sortFoods(rows)
}

export async function insertFood(food) {
  return check(await supabase.from('foods').insert(food).select().single())
}

export async function approveFood(id) {
  return check(await supabase.from('foods').update({ verified: true }).eq('id', id).select().single())
}

// A food typed from a label. Admin entries are the coach's and verified.
export async function createLabelFood({ uid, isAdmin, lang, name, barcode, kcal, protein, carbs, fat, serving }) {
  const he = HEBREW.test(name)
  const food = {
    source: isAdmin ? 'coach' : 'user',
    verified: !!isAdmin,
    created_by: uid,
    barcode: barcode || null,
    name_he: he ? name : null,
    name_en: he ? null : name,
    brand: null,
    kcal: round1(kcal),
    protein: round1(protein),
    carbs: round1(carbs),
    fat: round1(fat),
    units: serving > 0 ? [{ he: 'מנה', en: 'serving', g: serving }] : [],
  }
  food.search_text = searchTextFor(food)
  return insertFood(food)
}

// ---------------------------------------------------------------- barcode

const OFF_FIELDS =
  'code,product_name,product_name_he,product_name_en,brands,quantity,product_quantity,serving_size,serving_quantity,nutriments,image_front_small_url'
const LOOKUP_TIMEOUT_MS = 10000

// 8 (EAN-8), 12 (UPC-A) and 13 (EAN-13) digits, with a valid check digit.
export function validateBarcode(raw) {
  const code = String(raw || '').trim()
  if (!/^\d+$/.test(code) || ![8, 12, 13].includes(code.length)) return false
  const digits = code.split('').map(Number)
  const check = digits.pop()
  let sum = 0
  for (let i = digits.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += digits[i] * w
  return (10 - (sum % 10)) % 10 === check
}

// In-store labels for weighed goods start with 2 (13 digits).
export function isWeighedLabel(code) {
  return code.length === 13 && code[0] === '2'
}

// "250 g" / "1.5 kg" / "500 ml" / "1 l" -> grams (ml treated as g)
export function parseGrams(text) {
  const m = String(text ?? '').replace(',', '.').match(/(\d+(?:\.\d+)?)\s*(kg|gr|g|ml|l|ליטר|גרם|ק"ג|מ"ל|מל|גר|ג)(?![a-zא-ת])/i)
  if (!m) return null
  const n = parseFloat(m[1])
  const u = m[2].toLowerCase()
  const g = ['kg', 'l', 'ליטר', 'ק"ג'].includes(u) ? n * 1000 : n
  return g > 0 && g <= 20000 ? Math.round(g * 10) / 10 : null
}

function numOrNull(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))

// Open Food Facts product -> foods row (or null when it has no usable energy).
// Energy per 100 g in kcal. Many Israeli OFF products carry only kJ.
function offKcal(p) {
  const n = p.nutriments || {}
  const direct = numOrNull(n['energy-kcal_100g'])
  if (direct != null) return direct
  if (p.nutrition_data_per === '100g') {
    const plain = numOrNull(n['energy-kcal'])
    if (plain != null) return plain
  }
  const kj = numOrNull(n['energy-kj_100g']) ?? numOrNull(n.energy_100g) // energy_100g is kJ
  return kj == null ? null : kj / 4.184
}

export function offToFood(p, code, uid) {
  const n = p.nutriments || {}
  const kcal = offKcal(p)
  if (kcal == null || kcal < 0 || kcal > 900) return null
  // Energy alone would be logged as 0 g protein, carbs and fat: treat it as
  // incomplete so the label form asks for the numbers.
  if (['proteins_100g', 'carbohydrates_100g', 'fat_100g'].every((k) => numOrNull(n[k]) == null)) return null
  const pick = (...keys) => keys.map((k) => (p[k] && String(p[k]).trim()) || null).find(Boolean) || null
  const nameHe = pick('product_name_he')
  const nameEn = pick('product_name_en', 'product_name')
  const brand = p.brands ? String(p.brands).split(',')[0].trim() || null : null
  const units = []
  const pack = numOrNull(p.product_quantity) ?? parseGrams(p.quantity)
  if (pack > 0) units.push({ he: 'אריזה', en: 'package', g: round1(pack) })
  const serving = numOrNull(p.serving_quantity) ?? parseGrams(p.serving_size)
  if (serving > 0) units.push({ he: 'מנה', en: 'serving', g: round1(serving) })
  const fiber = numOrNull(n.fiber_100g)
  const food = {
    source: 'off',
    source_ref: code,
    barcode: code,
    name_he: nameHe,
    name_en: nameEn || (!nameHe ? brand || code : null),
    brand,
    kcal: round1(kcal),
    protein: round1(clamp(numOrNull(n.proteins_100g) ?? 0, 0, 100)),
    carbs: round1(clamp(numOrNull(n.carbohydrates_100g) ?? 0, 0, 100)),
    fat: round1(clamp(numOrNull(n.fat_100g) ?? 0, 0, 100)),
    fiber: fiber == null ? null : round1(clamp(fiber, 0, 100)),
    units,
    verified: false,
    created_by: uid,
  }
  food.search_text = searchTextFor(food)
  return food
}

async function fetchOff(code) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), LOOKUP_TIMEOUT_MS)
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}?fields=${OFF_FIELDS}`, { signal: ctrl.signal })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return data.status === 1 && data.product ? data.product : null
  } catch (err) {
    err.offFailure = true
    throw err
  } finally {
    clearTimeout(timer)
  }
}

// Cache an Open Food Facts row into `foods` (shared by scans and online
// search picks). Always resolves to a usable food: the stored row, the row
// someone else cached first, or the in-memory row when we may not insert
// (rights, offline) - then the log just has no food_id.
export async function cacheOffFood(row) {
  try {
    return await insertFood(row)
  } catch {
    // Already cached (23505), or a trainee may not insert (RLS): either way
    // use the stored row when there is one, so the log keeps its food_id.
    try {
      const { data } = await supabase.from('foods').select('*').eq('source', 'off').eq('source_ref', row.source_ref).limit(1)
      if (data?.[0]) return data[0]
    } catch {
      // offline: fall through to the in-memory row
    }
    return row
  }
}

// Barcode -> food. Known foods first, then Open Food Facts (cached into
// `foods` on the first scan). Returns
//   { status: 'found', food, image } | { status: 'notfound' } |
//   { status: 'incomplete', code, name, brand, servingG, image } (OFF has it, no energy)
// and throws on a network/database failure (err.offFailure for the former).
export async function resolveBarcode(code, uid) {
  const local = await findFoodsByBarcode(code)
  if (local.length) return { status: 'found', food: local[0], image: null }
  const product = await fetchOff(code)
  if (!product) return { status: 'notfound' }
  const row = offToFood(product, code, uid)
  if (!row) {
    // OFF knows the product but has no usable energy value: hand its details to the label form.
    const pick = (...keys) => keys.map((k) => (product[k] && String(product[k]).trim()) || null).find(Boolean) || null
    const servingG = numOrNull(product.serving_quantity) ?? parseGrams(product.serving_size)
    return {
      status: 'incomplete',
      code,
      name: pick('product_name_he', 'product_name_en', 'product_name'),
      brand: product.brands ? String(product.brands).split(',')[0].trim() || null : null,
      servingG: servingG > 0 ? round1(servingG) : null,
      image: product.image_front_small_url || null,
    }
  }
  const food = await cacheOffFood(row)
  return { status: 'found', food, image: product.image_front_small_url || null }
}

// ---------------------------------------------------------------- online search

const SEARCH_MIN_FRESH = 5
const SEARCH_LIMIT = 16 // per minute; each search uses one or two calls
const SEARCH_WINDOW_MS = 60000
const searchCalls = []
const searchCache = new Map()

export const normalizeQuery = (q) => String(q || '').trim().toLowerCase().replace(/\s+/g, ' ')

function takeSearchSlot() {
  const now = Date.now()
  while (searchCalls.length && now - searchCalls[0] > SEARCH_WINDOW_MS) searchCalls.shift()
  if (searchCalls.length >= SEARCH_LIMIT) return false
  searchCalls.push(now)
  return true
}

// Full-text search goes to Search-a-licious (search.openfoodfacts.org). The
// legacy cgi/search.pl answers 503 to anonymous callers most of the time, so
// it is only a fallback for when the new service can't be reached.
async function fetchOffJson(url, signal) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), LOOKUP_TIMEOUT_MS)
  const onAbort = () => ctrl.abort()
  if (signal?.aborted) ctrl.abort()
  else signal?.addEventListener('abort', onAbort)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

async function fetchOffSearch(query, israelOnly, signal) {
  try {
    try {
      const q = israelOnly ? `${query} countries_tags:"en:israel"` : query
      const data = await fetchOffJson(
        `https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=20&fields=${OFF_FIELDS}`,
        signal,
      )
      if (Array.isArray(data.hits)) return data.hits
      throw new Error('bad response')
    } catch (err) {
      if (signal?.aborted) throw err
      let url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=20&fields=${OFF_FIELDS}`
      if (israelOnly) url += '&tagtype_0=countries&tag_contains_0=contains&tag_0=israel'
      const data = await fetchOffJson(url, signal)
      return Array.isArray(data.products) ? data.products : []
    }
  } catch (err) {
    if (!signal?.aborted) err.offFailure = true
    throw err
  }
}

// Product name -> foods-shaped rows from Open Food Facts (not stored).
// Israeli products first; widens to the world when that gives few. Throws
// err.rateLimited when over the client-side limit, AbortError when cancelled.
export async function searchOff(query, { signal, uid } = {}) {
  const key = normalizeQuery(query)
  if (searchCache.has(key)) return searchCache.get(key)
  if (!takeSearchSlot()) {
    const err = new Error('rate limited')
    err.rateLimited = true
    throw err
  }
  const seen = new Set()
  const out = []
  const add = (products) => {
    for (const p of products) {
      const code = p?.code ? String(p.code) : ''
      if (!code || seen.has(code)) continue
      seen.add(code)
      const row = offToFood(p, code, uid)
      if (row) out.push(row)
    }
  }
  add(await fetchOffSearch(query.trim(), true, signal))
  let complete = true
  if (out.length < SEARCH_MIN_FRESH) {
    if (takeSearchSlot()) {
      try {
        add(await fetchOffSearch(query.trim(), false, signal))
      } catch (err) {
        if (signal?.aborted) throw err
        if (!out.length) throw err // the Israeli results still stand otherwise
        complete = false
      }
    } else complete = false
  }
  // Only remember full answers, so a later search can still widen.
  if (complete) searchCache.set(key, out)
  return out
}

// ---------------------------------------------------------------- favorites (per device)

const favKey = (uid) => `ironlog:fav-foods:${uid}`
export const FAV_EVENT = 'ironlog:favorites'
const FAV_MAX = 200

export function loadFavorites(uid) {
  try {
    const raw = localStorage.getItem(favKey(uid))
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function storeFavorites(uid, list) {
  try {
    localStorage.setItem(favKey(uid), JSON.stringify(list))
  } catch {
    // storage unavailable: favorites just don't persist
  }
}

const favSnapshot = (f) => ({
  id: f.id,
  source: f.source,
  verified: !!f.verified,
  barcode: f.barcode ?? null,
  name_he: f.name_he ?? null,
  name_en: f.name_en ?? null,
  brand: f.brand ?? null,
  kcal: f.kcal,
  protein: f.protein,
  carbs: f.carbs,
  fat: f.fat,
  fiber: f.fiber ?? null,
  units: f.units || [],
  search_text: f.search_text || '',
})

export function isFavorite(uid, food) {
  return !!food.id && loadFavorites(uid).some((f) => f.id === food.id)
}

// Returns the new starred state.
export function toggleFavorite(uid, food) {
  if (!food.id) return false
  const list = loadFavorites(uid)
  const has = list.some((f) => f.id === food.id)
  storeFavorites(uid, has ? list.filter((f) => f.id !== food.id) : [favSnapshot(food), ...list].slice(0, FAV_MAX))
  window.dispatchEvent(new Event(FAV_EVENT))
  return !has
}

// Favorites are snapshots; bring them up to date with the foods table
// (values corrected, food approved, food deleted) and return the fresh list.
// Offline or on an error the stored list stands.
export async function refreshFavorites(uid) {
  const list = loadFavorites(uid)
  if (!list.length) return list
  try {
    const rows = check(await supabase.from('foods').select('*').in('id', list.map((f) => f.id)))
    const byId = new Map(rows.map((r) => [r.id, r]))
    const fresh = list.filter((f) => byId.has(f.id)).map((f) => favSnapshot(byId.get(f.id)))
    storeFavorites(uid, fresh)
    return fresh
  } catch {
    return list
  }
}

export function defaultMeal(now = new Date()) {
  const h = now.getHours()
  if (h < 11) return 'breakfast'
  if (h < 16) return 'lunch'
  if (h < 21) return 'dinner'
  return 'snack'
}
