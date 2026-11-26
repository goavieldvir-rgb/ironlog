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
  let s = String(raw).replace(/^[\s\-•*·–—]+/, '').replace(/\s+/g, ' ').trim()
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
  } else if ((m = full(`^(.+?)\\s*[(\\[]?\\s*(${NUM})\\s*(${KG})\\s*[)\\]]?$`))) {
    qty = parseQty(m[2]) * 1000
    unit = 'g'
    s = m[1]
  } else if ((m = full(`^(.+?)\\s*[(\\[]?\\s*(${NUM})\\s*(${GRAM}|${ML})\\s*[)\\]]?$`))) {
    qty = parseQty(m[2])
    unit = 'g'
    s = m[1]
  }
  const query = s.replace(/[()[\]]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!query) return null
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

// A heading line: "Breakfast", "Lunch:", "ארוחת בוקר: 3 ביצים" or any other
// "Name:" line. Returns { meal, name, rest } (meal '?' when the name is not
// a known slot) or null when the line is a food list.
function heading(line) {
  const clean = line.replace(/^\s*#{1,4}\s*/, '').replace(/\*+/g, '').trim()
  const c = clean.match(/^([^:]{1,40}):\s*(.*)$/)
  const text = (c ? c[1] : clean).trim()
  const rest = c ? c[2].trim() : ''
  for (const [key, re] of SLOT_WORDS) {
    const h = text.match(re)
    if (!h) continue
    if (!c && h[0].trim().length !== text.length) continue
    let meal = key
    if (key === 'snack' && h[1]) meal = SNACKS[Math.min(Number(h[1]), 3) - 1] || 'snack'
    return { meal, name: text, rest }
  }
  if (c && !rest) return { meal: '?', name: text, rest: '' }
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
    const h = heading(line)
    const rest = h ? h.rest : line
    if (h) startMeal(h.meal, h.name)
    if (!rest) continue
    if (!cur) startMeal('?', '')
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
  const used = new Set(meals.filter((m) => m.meal !== '?').map((m) => m.meal))
  for (const m of meals) {
    if (m.meal !== '?') continue
    m.meal = SNACKS.find((k) => !used.has(k)) || 'snack3'
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
