// Meal plan import: turns pasted plan text into meals per slot, each food
// with an amount and optional "or" swaps. Pure (no Supabase), runs in Node.
//
//   Breakfast:
//   - 3 eggs, 100 g oats
//   - 200 g Greek yogurt or 150 g cottage cheese
//   ארוחת צהריים: 150 גרם חזה עוף, 1 כוס אורז
//
// A heading is a meal name (breakfast, lunch, dinner, snack, snack 2, snack 3
// or the Hebrew names) or any line that ends with ":" and has nothing after
// it. Foods are split on commas, semicolons, "+" and new lines; alternatives
// on " or " / " או " / " / ".

const SLOT_WORDS = [
  ['breakfast', /^(?:ארוחת\s+)?(?:breakfast|בוקר)(?![\p{L}])/iu],
  ['lunch', /^(?:ארוחת\s+)?(?:lunch|צהריים|צהרים)(?![\p{L}])/iu],
  ['dinner', /^(?:ארוחת\s+)?(?:dinner|supper|ערב)(?![\p{L}])/iu],
  ['snack', /^(?:ארוחת\s+)?(?:snack|ביניים|חטיף)\s*(\d)?(?![\p{L}])/iu],
]
const SNACKS = ['snack', 'snack2', 'snack3']

const NUM = String.raw`(?:\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?|[½¼¾])`
const GRAM = String.raw`(?:g|gr|gm|gram|grams|גרם|גר|ג)['׳]?`
const KG = String.raw`(?:kg|kilo|ק"ג|קילו|קג)`
const ML = String.raw`(?:ml|מ"ל|מל)`
const UNIT_WORDS = {
  cup: /^(?:cups?|כוס|כוסות)$/i,
  tbsp: /^(?:tbsp|tablespoons?|כף|כפות)$/i,
  tsp: /^(?:tsp|teaspoons?|כפית|כפיות)$/i,
  slice: /^(?:slices?|פרוסה|פרוסות)$/i,
  scoop: /^(?:scoops?|סקופ)$/i,
  piece: /^(?:pieces?|pcs|units?|יח'?|יחידה|יחידות)$/i,
}

export function parseQty(s) {
  const t = String(s).trim().replace(',', '.')
  if (t === '½') return 0.5
  if (t === '¼') return 0.25
  if (t === '¾') return 0.75
  const f = t.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+)$/)
  if (f) return Number(f[1]) / Number(f[2])
  const n = Number(t)
  return Number.isFinite(n) ? n : NaN
}

// "150 g chicken breast" / "chicken breast 150g" / "3 eggs" / "1 cup rice"
// -> { qty, unit: 'g' | 'cup' | ... | null, query }
export function parseFood(raw) {
  let s = String(raw).replace(/^[\s\-•*·–—]+/, '').replace(/^\d{1,2}[.)]\s+/, '').replace(/\s+/g, ' ').trim()
  // "(about 160 g)" and other notes: kept only for a gram amount we lack.
  let noteGrams = NaN
  s = s.replace(/\(([^)]*)\)/g, (_, note) => {
    const g = note.match(new RegExp(`(${NUM})\\s*(${GRAM})(?![\\p{L}])`, 'iu'))
    if (g && !Number.isFinite(noteGrams)) noteGrams = parseQty(g[1])
    return ' '
  }).replace(/\s+/g, ' ').trim()
  const WORD_QTY = [[/^(?:half|חצי)\s+/i, 0.5], [/^(?:quarter|רבע)\s+/i, 0.25]]
  for (const [re, v] of WORD_QTY) if (re.test(s)) s = `${v} ${s.replace(re, '')}`
  if (!s) return null
  let qty = NaN
  let unit = null
  const full = (re) => s.match(new RegExp(re, 'iu'))
  let m = full(`^(${NUM})\\s*(${KG})(?=\\s|$)\\s*(?:of\\s+|של\\s+)?(.*)$`)
  if (m) {
    qty = parseQty(m[1]) * 1000
    unit = 'g'
    s = m[3]
  } else if ((m = full(`^(${NUM})\\s*(${GRAM}|${ML})(?=\\s|$)\\s*(?:of\\s+|של\\s+)?(.*)$`))) {
    qty = parseQty(m[1])
    unit = 'g'
    s = m[3]
  } else if ((m = full(`^(${NUM})\\s+([^\\s]+)\\s+(?:of\\s+|של\\s+)?(.+)$`)) && Object.values(UNIT_WORDS).some((re) => re.test(m[2]))) {
    qty = parseQty(m[1])
    unit = Object.keys(UNIT_WORDS).find((k) => UNIT_WORDS[k].test(m[2]))
    s = m[3]
  } else if ((m = full(`^([^\\s]+)\\s+(?:of\\s+|של\\s+)?(.+)$`)) && Object.values(UNIT_WORDS).some((re) => re.test(m[1])) && !/^\d/.test(s)) {
    qty = 1
    unit = Object.keys(UNIT_WORDS).find((k) => UNIT_WORDS[k].test(m[1]))
    s = m[2]
  } else if ((m = full(`^(${NUM})\\s*x?\\s+(.+)$`))) {
    qty = parseQty(m[1])
    s = m[2]
  } else if ((m = full(`^(.+?)\\s+(${NUM})\\s*([^\\s\\d]+)$`)) && Object.values(UNIT_WORDS).some((re) => re.test(m[3]))) {
    qty = parseQty(m[2])
    unit = Object.keys(UNIT_WORDS).find((k) => UNIT_WORDS[k].test(m[3]))
    s = m[1]
  } else if ((m = full(`^(.+?)\\s*[(\\[]?\\s*(${NUM})\\s*(${KG})\\s*[)\\]]?$`))) {
    qty = parseQty(m[2]) * 1000
    unit = 'g'
    s = m[1]
  } else if ((m = full(`^(.+?)\\s*[(\\[]?\\s*(${NUM})\\s*(${GRAM}|${ML})\\s*[)\\]]?$`))) {
    qty = parseQty(m[2])
    unit = 'g'
    s = m[1]
  }
  const query = s.replace(/[()[\]]/g, ' ').replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, '').replace(/\s+/g, ' ').trim()
  if (!query) return null
  if (!Number.isFinite(qty) && Number.isFinite(noteGrams) && noteGrams > 0) {
    qty = noteGrams
    unit = 'g'
  }
  return { qty: Number.isFinite(qty) && qty > 0 ? qty : null, unit, query }
}

function splitTop(line) {
  // Commas inside parentheses stay.
  const out = []
  let depth = 0
  let cur = ''
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === ',' && /\d/.test(line[i - 1] || '') && /\d/.test(line[i + 1] || '')) {
      cur += ch
      continue
    }
    if (ch === '(' || ch === '[') depth++
    if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1)
    if (depth === 0 && /[,;+،]/.test(ch)) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out.map((x) => x.trim()).filter(Boolean)
}

const ALT_SPLIT = /\s+(?:or|או)\s+|\s+\/\s+/i

// The slot a label names ('breakfast'..'snack3') or null. `whole`: the label
// must be only the slot phrase ("Dinner", "Snack 2"), not a food that starts
// with one ("Dinner rolls", "Snack bar 30g").
function slotOf(label, whole) {
  for (const [key, re] of SLOT_WORDS) {
    const h = label.match(re)
    if (!h) continue
    if (whole ? h[0].trim().length !== label.length : label.split(/\s+/).length > 3) continue
    if (key === 'snack' && h[1]) return SNACKS[Math.min(Number(h[1]), 3) - 1] || 'snack'
    return key
  }
  return null
}

// A heading line: "Breakfast", "Lunch:", "Meal 2 - Lunch", "Breakfast 08:00",
// "Protein shake: 1 scoop whey", "ארוחת בוקר: 3 ביצים". Returns
// { meal, name, rest } (meal '?' = unknown name, '?n' = a numbered meal or
// a plan with no headings) or null when the line is a food list.
function heading(line) {
  const clean = line
    .replace(/^\s*#{1,4}\s*/, '')
    .replace(/\*+/g, '')
    .replace(/^\d{1,2}[.)]\s+(?=\D)/, '')
    .replace(/\(?\b\d{1,2}:\d{2}\b\)?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const num = clean.match(/^(?:meal|ארוחה)\s*\d+\s*(?:[-–—:.)]\s*)?(.*)$/i)
  const body = num ? num[1].trim() : clean
  const colon = body.match(/^([^:]{1,40}?)\s*:\s*(.*)$/)
  const dash = !colon && body.match(/^([^-–—:]{1,40}?)\s+[-–—]\s+(.+)$/)
  const label = (colon ? colon[1] : dash && slotOf(dash[1].trim(), true) ? dash[1] : body).trim()
  const rest = colon ? colon[2].trim() : dash && slotOf(dash[1].trim(), true) ? dash[2].trim() : ''
  const whole = !colon && !(dash && slotOf(dash[1].trim(), true))
  const meal = label ? slotOf(label, whole) : null
  if (meal) return { meal, name: label, rest }
  if (num) {
    // "Meal 3: foods", "Meal 3 - Pre-workout", or "Meal 3 3 eggs, toast".
    const foods = !colon && (/[,;+]/.test(body) || /\d/.test(body))
    return { meal: '?n', name: foods || !label ? (line.match(/^[^\d]*\d+/)?.[0] || 'Meal').replace(/\*+/g, '').trim() : label, rest: foods ? body : rest }
  }
  if (colon && label && !/\d/.test(label) && label.split(/\s+/).length <= 4) return { meal: '?', name: label, rest }
  return null
}

// text -> [{ meal, name, items: [{ choices: [{ qty, unit, query, orig }] }] }]
export function parseMealPlan(text) {
  const meals = []
  let cur = null
  const startMeal = (meal, name) => {
    cur = { meal, name, items: [] }
    meals.push(cur)
  }
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || /^[-=_*]{3,}$/.test(line)) continue
    if (/^[\s*#\-•]*(?:totals?|sum|סה"כ|סהכ|סה״כ|calories|קלוריות|macros?|notes?|הערה|הערות)\b/i.test(line) && /:/.test(line)) continue
    const h = heading(line)
    const rest = h ? h.rest : line
    if (h) startMeal(h.meal, h.name)
    if (!rest) continue
    if (!cur) startMeal('?n', '')
    for (const piece of splitTop(rest)) {
      const choices = piece
        .split(ALT_SPLIT)
        .map((c) => ({ ...parseFood(c), orig: c.trim() }))
        .filter((c) => c.query)
      if (choices.length) cur.items.push({ choices })
    }
  }
  // Settle the slots: unknown headings take the next free snack slot, then
  // meals with no slot at all get the first free one.
  const used = new Set(meals.filter((m) => !m.meal.startsWith('?')).map((m) => m.meal))
  const ORDER = ['breakfast', 'lunch', 'dinner', ...SNACKS]
  for (const m of meals) {
    if (!m.meal.startsWith('?')) continue
    // "Meal 2" and a plan with no headings fill the day in order; any other
    // unknown heading ("Pre-workout") is a snack.
    const pool = m.meal === '?n' ? ORDER : SNACKS
    m.meal = pool.find((k) => !used.has(k)) || 'snack3'
    used.add(m.meal)
  }
  return meals.filter((m) => m.items.length)
}

// Totals of a day: the first option of every slot, against nothing else.
export function dayTotals(coachMeals, sum) {
  const first = new Map()
  for (const m of coachMeals) if (!first.has(m.meal)) first.set(m.meal, m)
  const rows = [...first.values()].flatMap((m) => (Array.isArray(m.items) ? m.items : []))
  return sum(rows)
}
