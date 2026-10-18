import { normalizeHe } from './foodText.js'

// Food search ranking. Pure (no Supabase import) so it can rank the on-device
// catalog, server results and Open Food Facts results the same way, and so it
// runs in plain Node for tests.
//
// Every query word is matched against the words of a food's name:
//   4 the same word ("egg" = "Egg", "ביצים" = "ביצה" by stem, "בקוטג" = "קוטג")
//   3 a name word starts with it ("קוטג" -> "קוטג'", "egg" -> "eggplant")
//   2 a name word starts with its stem
//   1 it sits inside a name word ("שוקו" in "חלבשוקו")
// A food that misses a word is not a result. On top of that the head noun
// (the first word, "Rice" in "Rice, white, cooked") counts most, then the
// first comma segment; later segments are preparation or brand.

const HE_PREFIXES = 'הבלומשכ'
const SPLIT = /[\s,;:.()/\\\-+%*&"]+/
const LATIN = /[a-z]/
const HEBREW = /[֐-׿]/

const stripPrefix = (w) => (w.length > 3 && HE_PREFIXES.includes(w[0]) ? w.slice(1) : w)

// Singular-ish stem: "eggs" -> "egg", "potatoes" -> "potato", "berries" ->
// "berry", "ביצים"/"ביצה" -> "ביצ", "עגבניות"/"עגבניה" -> "עגבני".
export function stem(w) {
  if (LATIN.test(w)) {
    if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`
    if (w.length > 4 && /(oes|ches|shes|sses|xes)$/.test(w)) return w.slice(0, -2)
    if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
    return w
  }
  // Words arrive normalised, so a final ם is already מ.
  if (w.length > 4 && (w.endsWith('ימ') || w.endsWith('ות'))) return w.slice(0, -2)
  if (w.length > 3 && (w.endsWith('ה') || w.endsWith('ת'))) return w.slice(0, -1)
  return w
}

function words(text) {
  return normalizeHe(text).split(SPLIT).filter(Boolean)
}

// Processed/derived variants lose ties against the plain food ("ביצה שלמה"
// before "ביצה חלמון מיובש", "אורז לבן" before "קמח אורז") unless the query
// asks for them.
const DERIVED = new Set(
  ['מיובש', 'מיובשת', 'מטוגן', 'מטוגנת', 'קפוא', 'חביתה', 'קמח', 'פודינג', 'עוגה', 'עוגת', 'עוגיות', 'חלבון', 'חלמון', 'שניצל', 'סלט', 'נקניק', 'נקניקיות', 'פסטרמה', 'מרק', 'פאי', 'במילוי', 'ציפס', 'טוגנים', 'בבלילה', 'בציפוי', 'מצופה', 'ממרח', 'רוטב', 'משקה', 'מיצ', 'נקטר', 'שמנ', 'יינ', 'פשטידה', 'פשטידת', 'קציצות', 'חטיפ', 'סוכריות', 'shnitzel', 'salad', 'pastrami', 'soup', 'pie', 'chips', 'coated', 'covered', 'dried', 'fried', 'frozen', 'omelet', 'omelette', 'flour', 'pudding', 'cake', 'cookies', 'yolk', 'sauce', 'spread', 'drink', 'beverage', 'juice', 'nectar', 'oil', 'wine', 'quiche', 'patties', 'mousse', 'candy', 'bar'].map(normalizeHe),
)

// Rows nobody means unless they ask for them: food-frequency questionnaire
// composites, infant formula and baby food, medical foods, breast milk, and
// liquid cheese whey (people typing "whey" mean protein powder).
const NOISE = [/^ffq/, /^infant/, /^medical food/, /^baby/, /^מזונ רפואי/, /^תמל/, /לתינוקות/, /^חלב אמ\b/, /^milk, human/, /^porridge, infant/, /^whey, (acid|sweet), fluid/, /^מי גבינה, (חומצי|מתוק)/]
const NOISE_WORDS = new Set(['ffq', 'infant', 'medical', 'baby', 'תמל', 'תינוקות', 'לתינוקות', 'רפואי', 'human', 'אמ'].map(normalizeHe))

// Staples: the plain, everyday version of foods trainees log most, so
// "עוף" opens on chicken breast and "rice" on cooked white rice. Tzameret
// codes (foods.source_ref of source 'moh').
export const STAPLES = new Set(
  [
    1561, 1566, // egg
    805, // chicken breast, roasted, skin not eaten
    946, 944, // turkey breast
    1478, // ground beef, cooked
    1360, // tuna canned in water
    1298, // salmon baked
    15, 25, // milk 3%, 1%
    494, 532, // cottage 5%, white cheese 5% (Tnuva)
    62, // yoghurt 3%
    431, // yellow cheese 22%
    2721, // rice white cooked
    8552, 2659, // pasta cooked, whole wheat pasta cooked
    8199, // oats (Quaker)
    2773, 1669, 1653, // quinoa, lentils, chickpeas cooked
    1919, // white bread
    1946, // pita
    3459, 3654, // potato boiled, sweet potato baked
    1641, 1898, // hummus salad, raw tahini
    4443, // olive oil
    3223, // avocado
    1815, 1854, 1858, // almonds, walnuts, peanut butter
    3225, 3201, 3120, 3339, 8213, 3322, 3250, // banana, apple, orange, strawberries, medjool date, watermelon, grapes
    3793, 3663, 3626, 3839, 3820, // cucumber, tomato, carrot, red pepper, onion
    4544, 4388, // honey, butter
  ].map(String),
)

// Brands are typed in either script and with or without spaces ("All in",
// "allin", "אול אין"), so a brand also answers to its joined form and its
// spelling in the other script.
const BRAND_ALIASES = [
  ['all in', 'allin', 'אול אין', 'אולאין'],
  ['alfa', 'אלפא'],
  ['myprotein', 'my protein', 'מיי פרוטאין', 'מייפרוטאין'],
  ['optimum nutrition', 'אופטימום'],
  ['dymatize', 'דיימטייז'],
  ['muscletech', 'מאסלטק'],
  ['scitec nutrition', 'סייטק'],
  ['quest', 'קווסט'],
  ['barebells', 'בארבלס', 'בר בלס'],
  ['grenade', 'גרנייד'],
  ['yotvata', 'יטבתה'],
  ['tnuva', 'תנובה'],
  ['strauss', 'שטראוס'],
  ['elite', 'עלית'],
  ['osem', 'אסם'],
  ['danone', 'דנונה'],
  ['muller', 'mueller', 'מולר'],
  ['tara', 'טרה'],
  ['nestle', 'נסטלה'],
  ['quaker', 'קוואקר'],
  ['tivall', 'טבעול'],
  ['of tov', 'עוף טוב'],
  ['willi food', 'ויליפוד'],
  ['shufersal', 'שופרסל'],
  ['prozis', 'פרוזיס'],
  ['kinder', 'קינדר'],
  ['nutella', 'נוטלה'],
  ['lotus', 'לוטוס'],
  ['milka', 'מילקה'],
  ['oreo', 'אוראו'],
  ['alpro', 'אלפרו'],
].map((group) => group.map((b) => words(b)))

function brandWords(brand) {
  if (!brand) return []
  const own = words(brand)
  const extra = new Set(own.length > 1 ? [own.join('')] : [])
  const key = own.join(' ')
  for (const group of BRAND_ALIASES) {
    if (group.some((ws) => ws.join(' ') === key || ws.join('') === own.join(''))) {
      for (const ws of group) {
        ws.forEach((w) => extra.add(w))
        if (ws.length > 1) extra.add(ws.join(''))
      }
    }
  }
  return [...own, ...[...extra].filter((w) => !own.includes(w))]
}

// One name, prepared once per food.
function prepName(name) {
  const norm = normalizeHe(name)
  if (!norm) return null
  const toks = words(norm)
  if (!toks.length) return null
  const firstSeg = norm.split(',')[0]
  return {
    flat: toks.join(' '),
    firstSeg: words(firstSeg).join(' '),
    toks,
    // A name word's stems, with and without a one-letter Hebrew prefix.
    stems: toks.map((t) => [...new Set([stem(t), stem(stripPrefix(t))])]),
    segLen: words(firstSeg).length,
    derived: toks.filter((t) => DERIVED.has(t) || DERIVED.has(stem(t))),
    noise: NOISE.some((re) => re.test(norm)),
  }
}

const prepared = new WeakMap()
function prep(food) {
  let p = prepared.get(food)
  if (!p) {
    p = { he: prepName(food.name_he), en: prepName(food.name_en), brand: brandWords(food.brand) }
    // Every word of the food in one string, for a cheap first pass.
    p.hay = [...(p.he?.toks || []), ...(p.en?.toks || []), ...p.brand].join(' ')
    prepared.set(food, p)
  }
  return p
}

// Product words in the other script, so "אלפא חלבון" finds "Alfa Whey" and
// "protein bar" finds "חטיף חלבון". Only for words that recur on labels.
const TERMS = Object.fromEntries(
  [
    ['חלבון', 'protein', 'whey'],
    ['חטיף', 'bar'],
    ['אבקה', 'powder'],
    ['אבקת', 'powder'],
    ['שייק', 'shake'],
    ['משקה', 'drink', 'shake'],
    ['שוקולד', 'chocolate', 'choco'],
    ['וניל', 'vanilla'],
    ['עוגיות', 'cookies', 'cookie'],
    ['קרמל', 'caramel'],
    ['בננה', 'banana'],
    ['תות', 'strawberry'],
    ['קפה', 'coffee'],
    ['בוטנים', 'peanut'],
    ['יוגורט', 'yogurt', 'yoghurt'],
    ['פודינג', 'pudding'],
    ['קריספי', 'crispy'],
    ['פריכיות', 'rice cakes'],
  ].flatMap((group) => {
    const g = group.map((w) => normalizeHe(w))
    // Only across scripts: "whey" and "protein" stay different words.
    return g.map((w) => [w, g.filter((x) => HEBREW.test(x) !== HEBREW.test(w) && !x.includes(' '))])
  }),
)

export function prepareQuery(query) {
  const ws = words(query)
  return {
    norm: ws.join(' '),
    he: HEBREW.test(query),
    words: ws.map((w) => {
      const exact = [...new Set([w, stripPrefix(w), ...(TERMS[w] || []), ...(TERMS[stripPrefix(w)] || [])])]
      return { w, exact, stems: [...new Set(exact.map(stem))].filter((s) => s.length >= 2) }
    }),
    wantsNoise: ws.some((w) => NOISE_WORDS.has(w) || NOISE_WORDS.has(stripPrefix(w))),
    wantsDerived: new Set(ws.flatMap((w) => [w, stem(w), stripPrefix(w), stem(stripPrefix(w))]).filter((w) => DERIVED.has(w))),
  }
}

// Best match of one query word against a token list: { q, i } (q = 0: none).
function matchWord(qw, toks, stems) {
  let best = { q: 0, i: -1 }
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]
    const tp = t.length > 2 && HE_PREFIXES.includes(t[0]) ? t.slice(1) : null
    let q = 0
    if (qw.exact.includes(t) || (tp && qw.exact.includes(tp))) q = 4
    else if (stems[i].some((x) => qw.stems.includes(x))) q = 3.6
    else if (qw.exact.some((x) => t.startsWith(x) || (tp && tp.startsWith(x)))) q = 3
    else if (qw.stems.some((x) => t.startsWith(x) || (tp && tp.startsWith(x)))) q = 2
    else if (qw.w.length >= 3 && t.includes(qw.w)) q = 1
    if (q > best.q) best = { q, i }
    if (q === 4) break
  }
  return best
}

// Score of one prepared name, or -Infinity when a query word is missing.
function scoreName(pn, brand, pq, exactWeight = 1) {
  if (!pn) return -Infinity
  let s = 0
  let weakest = 4
  pq.words.forEach((qw, k) => {
    let m = matchWord(qw, pn.toks, pn.stems)
    let inBrand = false
    if (!m.q && brand.length) {
      m = matchWord(qw, brand, brand.map((b) => [stem(b)]))
      inBrand = m.q > 0
    }
    if (!m.q) {
      s = -Infinity
      return
    }
    weakest = Math.min(weakest, m.q)
    s += m.q * 100 - (inBrand ? 60 : 0)
    // The food itself: the head noun and the first comma segment.
    if (!inBrand && m.i === 0 && m.q >= 3) s += k === 0 ? 160 : 60
    else if (!inBrand && m.i < pn.segLen && m.q >= 3) s += 50
  })
  if (s === -Infinity) return s
  if (pn.flat === pq.norm) s += 500 * exactWeight
  else if (pn.firstSeg === pq.norm) s += 260 * exactWeight
  else if (pn.flat.startsWith(pq.norm)) s += 90 * exactWeight
  // Shorter names win ties: "Avocado" before "Avocado, raw, with peel and pip".
  s -= Math.max(0, pn.toks.length - pq.words.length) * 15
  if (pn.derived.some((d) => !pq.wantsDerived.has(d) && !pq.wantsDerived.has(stem(d)))) s -= 140
  if (pn.noise && !pq.wantsNoise) s -= 600
  return { s, weakest }
}

const SOURCE_BONUS = { coach: 30, moh: 15, usda: 12, off: 0, user: -10 }

// history: Map food_id -> { count } of the user's own logs.
export function scoreFood(food, pq, history) {
  const p = prep(food)
  // Any match needs each query word (or its stem or alias) inside some word
  // of the food; skip the full scoring for the many foods that fail that.
  if (!pq.words.every((qw) => qw.exact.some((x) => p.hay.includes(x)) || qw.stems.some((x) => p.hay.includes(x)))) return null
  const primary = pq.he ? p.he : p.en
  const secondary = pq.he ? p.en : p.he
  // A packaged product named just "Milk" or "טונה" should not beat the
  // reference food of that name, so its exact-name bonus counts for less.
  const w = food.source === 'off' ? 0.4 : 1
  const a = scoreName(primary, p.brand, pq, w)
  const b = scoreName(secondary, p.brand, pq, w)
  const best = a === -Infinity ? (b === -Infinity ? null : { ...b, s: b.s - 20 }) : b === -Infinity || a.s >= b.s - 20 ? a : { ...b, s: b.s - 20 }
  if (!best) return null
  let s = best.s
  if (food.verified) s += 30
  s += SOURCE_BONUS[food.source] ?? 0
  if (food.source === 'moh' && STAPLES.has(String(food.source_ref))) s += 300
  const h = food.id && history?.get(food.id)
  if (h) s += Math.min(300, 140 + 40 * h.count)
  return { s, weakest: best.weakest }
}

// Best `limit` foods for a query. When there are enough proper matches,
// matches that only sit inside a word ("weak") are dropped.
export function rankFoods(foods, query, { limit = 30, history } = {}) {
  const pq = prepareQuery(query)
  if (!pq.words.length) return []
  const scored = []
  for (const f of foods) {
    const r = scoreFood(f, pq, history)
    if (r) scored.push({ f, s: r.s, weakest: r.weakest })
  }
  const strong = scored.filter((x) => x.weakest >= 3).length
  const kept = strong >= 5 ? scored.filter((x) => x.weakest >= 2) : scored
  kept.sort((x, y) => y.s - x.s || foodLabel(x.f).length - foodLabel(y.f).length)
  return kept.slice(0, limit).map((x) => x.f)
}

const foodLabel = (f) => f.name_he || f.name_en || ''

// True when every query word matches a name word at its start (or better):
// used to drop loose Open Food Facts hits.
export function isStrongMatch(food, query) {
  const r = scoreFood(food, prepareQuery(query))
  return !!r && r.weakest >= 3
}
