#!/usr/bin/env node
// Israel Ministry of Health "Tzameret" generic foods -> SQL for public.foods.
//
//   node scripts/tzameret-import.mjs <csv-dir> <out-dir> [--json <path> | <json-path>]
//
// Two outputs with identical values:
//   1. SQL chunks in <out-dir> (upserts you can apply directly), and
//   2. optionally a compact JSON array of {source_ref, name_he, name_en, kcal,
//      protein, carbs, fat, fiber, units, search_text} (committed as
//      supabase/data/tzameret-foods.json). The database loads that JSON
//      server-side with the pg_net snippet in supabase/data/README.md.
//
// Reads moh_mitzrachim.csv, moh_yehidot_mida_lemitzrachim.csv and
// moh_yehidot_mida.csv from <csv-dir> (treated as data only) and writes
// tzameret-001.sql, tzameret-002.sql, ... (about 500 rows each) to <out-dir>.
// Every chunk is a single idempotent upsert on (source, source_ref).
// Nothing is executed against any database. search_text comes from the same
// helper the app uses (src/lib/foodText.js), so searches match exactly.

import fs from 'node:fs'
import path from 'node:path'
import { searchTextFor } from '../src/lib/foodText.js'

const CHUNK = 500
const MAX_UNIT_G = 2000
// Pure weight units: redundant with the app's grams mode.
const SKIP_MIDA = new Set(['700', '2000']) // גרמים, קילוגרם

// The unit-name CSV is Hebrew only; English labels for its ~108 unit codes.
const UNIT_EN = {
  100: 'unit', 101: 'very small unit', 102: 'small unit', 103: 'medium unit', 104: 'large unit', 105: 'very large unit',
  106: 'small pouch', 107: 'medium pouch', 200: 'cup', 201: 'measuring cup', 202: 'mug', 203: 'soup mug', 204: 'wine glass',
  205: 'cup, cubed', 206: 'cup, sliced', 207: 'cup, chopped', 208: 'cup, mashed', 209: 'small wine glass',
  300: 'tbsp', 301: 'level tbsp', 302: 'heaped tbsp', 304: 'ice cream scoop', 305: 'small ladle', 307: 'large ladle', 308: 'measuring tbsp',
  400: 'tsp', 401: 'level tsp', 402: 'heaped tsp', 500: 'slice', 501: 'thin slice', 502: 'medium slice', 503: 'thick slice',
  600: 'tub', 601: 'very small tub', 602: 'small tub', 603: 'medium tub', 604: 'large tub', 605: 'divided tub',
  800: 'serving', 801: 'small serving', 802: 'medium serving', 803: 'large serving',
  900: 'package', 901: 'pack', 902: 'bar/pack', 903: 'bag', 904: 'carton', 905: 'single-serve pack', 906: 'box', 907: 'tube', 908: 'jar',
  909: 'small carton', 910: 'large carton', 911: 'small pack/bag', 912: 'large pack',
  1001: 'small plate', 1002: 'medium plate', 1003: 'large plate', 1004: 'soup plate', 1005: 'soup bowl', 1006: 'small side dish', 1007: 'disposable bowl',
  1100: 'bottle', 1101: 'small bottle', 1102: 'medium bottle', 1103: 'large bottle', 1104: 'can', 1105: 'small can', 1106: 'large can',
  1201: 'stalk', 1202: 'strip/stick', 1203: 'leaf', 1204: 'round/ball', 1205: 'wedge', 1206: 'triangle', 1207: 'square/cube', 1208: 'finger',
  1209: 'roll/cylinder', 1210: 'tablet', 1211: 'clove', 1212: 'floret', 1213: 'thick stick', 1214: 'thin stick', 1215: 'head', 1216: 'drop',
  1217: 'cob', 1218: 'handful', 1219: 'snack', 1220: 'mini snack', 1221: 'small snack', 1222: 'medium snack', 1223: 'large snack',
  1224: 'bun', 1225: 'candy', 1226: 'pita', 1227: 'homemade pita', 1228: 'grapefruit', 1229: 'small fillet', 1230: 'medium fillet',
  1231: 'large fillet', 1232: 'small, boneless', 1233: 'medium, boneless', 1234: 'large, boneless', 1235: 'small, whole',
  1236: 'medium, whole', 1237: 'large, whole',
}

// ---------------------------------------------------------------- csv

// Minimal RFC 4180 parser: quoted fields, doubled quotes, CR/LF, BOM.
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const rows = []
  let row = []
  let field = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else q = false
      } else field += c
    } else if (c === '"' && field === '') q = true // a quote only opens a quoted field at its start
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  const head = rows.shift().map((h) => h.trim())
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])))
}

const readCsv = (dir, name) => parseCsv(fs.readFileSync(path.join(dir, name), 'utf8'))

// ---------------------------------------------------------------- helpers

const clean = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
const r1 = (n) => Math.round(n * 10) / 10
const num = (s) => {
  const t = String(s ?? '').trim().replace(',', '.')
  if (t === '' || !/^-?\d*\.?\d+(e[+-]?\d+)?$/i.test(t)) return NaN
  return Number(t)
}
const clamp100 = (n) => r1(Math.min(100, Math.max(0, n)))

// SQL string literal. Standard strings double the quote; E'' only when a
// backslash is present.
function lit(s) {
  if (s == null) return 'null'
  const v = String(s)
  if (v.includes('\\')) return `E'${v.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`
  return `'${v.replace(/'/g, "''")}'`
}
const numLit = (n) => (n == null ? 'null' : String(n))

// ---------------------------------------------------------------- main

const argv = process.argv.slice(2)
const ji = argv.indexOf('--json')
let jsonPath = null
if (ji >= 0) { jsonPath = argv[ji + 1]; argv.splice(ji, 2) }
const [csvDir, outDir, thirdArg] = argv
jsonPath = jsonPath || thirdArg || null
if (!csvDir || !outDir) {
  console.error('usage: node scripts/tzameret-import.mjs <csv-dir> <out-dir>')
  process.exit(1)
}

const foods = readCsv(csvDir, 'moh_mitzrachim.csv')
const servings = readCsv(csvDir, 'moh_yehidot_mida_lemitzrachim.csv')
const midaRows = readCsv(csvDir, 'moh_yehidot_mida.csv')

const midaHe = new Map(midaRows.map((m) => [clean(m.smlmida), clean(m.shmmida)]))
const servingsByFood = new Map()
for (const s of servings) {
  const k = clean(s.mmitzrach)
  if (!servingsByFood.has(k)) servingsByFood.set(k, [])
  servingsByFood.get(k).push(s)
}

const skipped = {}
const skip = (why) => { skipped[why] = (skipped[why] || 0) + 1 }
const unitSkips = {}
const uskip = (why) => { unitSkips[why] = (unitSkips[why] || 0) + 1 }
const hasEnglishCol = foods.length > 0 && 'english_name' in foods[0]
const out = []
const seen = new Set()
const fillNoted = { carbsMissing: 0, fiberNull: 0, clamped: 0 }

function unitsFor(code) {
  const seenU = new Set()
  const list = []
  for (const s of servingsByFood.get(code) || []) {
    const mida = clean(s.mida)
    if (SKIP_MIDA.has(mida)) { uskip('grams/kg unit'); continue }
    const he = midaHe.get(mida)
    if (!he) { uskip('unknown unit code'); continue }
    const g = num(s.mishkal)
    if (!Number.isFinite(g) || g <= 0) { uskip('grams missing or <= 0'); continue }
    if (g > MAX_UNIT_G) { uskip(`> ${MAX_UNIT_G} g`); continue }
    const gr = r1(g)
    if (gr <= 0) { uskip('grams missing or <= 0'); continue }
    const key = `${he}|${gr}`
    if (seenU.has(key)) { uskip('duplicate'); continue }
    seenU.add(key)
    const u = { he }
    if (UNIT_EN[mida]) u.en = UNIT_EN[mida]
    u.g = gr
    list.push(u)
  }
  return list.sort((a, b) => a.g - b.g || a.he.localeCompare(b.he, 'he'))
}

for (const f of foods) {
  const code = clean(f.Code)
  if (!code) { skip('missing Code'); continue }
  if (seen.has(code)) { skip('duplicate Code'); continue }
  const name_he = clean(f.shmmitzrach) || null
  const name_en = hasEnglishCol ? clean(f.english_name) || null : null
  if (!name_he && !name_en) { skip('no name'); continue }
  const kcalRaw = num(f.food_energy)
  if (!Number.isFinite(kcalRaw)) { skip('kcal missing/invalid'); continue }
  if (kcalRaw < 0 || kcalRaw > 900) { skip('kcal outside 0..900'); continue }
  const m = { protein: num(f.protein), carbs: num(f.carbohydrates), fat: num(f.total_fat) }
  for (const [k, v] of Object.entries(m)) {
    if (!Number.isFinite(v)) { m[k] = 0; if (k === 'carbs') fillNoted.carbsMissing++ }
    else if (v < 0 || v > 100) fillNoted.clamped++
  }
  const fiberRaw = num(f.total_dietary_fiber)
  const fiber = Number.isFinite(fiberRaw) ? clamp100(fiberRaw) : null
  if (fiber == null) fillNoted.fiberNull++
  seen.add(code)
  const row = {
    source_ref: code,
    name_he,
    name_en,
    kcal: r1(kcalRaw),
    protein: clamp100(m.protein),
    carbs: clamp100(m.carbs),
    fat: clamp100(m.fat),
    fiber,
    units: unitsFor(code),
  }
  row.search_text = searchTextFor(row) // uses name_he, name_en, brand
  out.push(row)
}

const values = (r) =>
  `('moh', ${lit(r.source_ref)}, null, ${lit(r.name_he)}, ${lit(r.name_en)}, null, ${numLit(r.kcal)}, ${numLit(r.protein)}, ${numLit(r.carbs)}, ${numLit(r.fat)}, ${numLit(r.fiber)}, ${lit(JSON.stringify(r.units))}::jsonb, ${lit(r.search_text)}, false, null)`

const HEAD = 'insert into public.foods (source, source_ref, barcode, name_he, name_en, brand, kcal, protein, carbs, fat, fiber, units, search_text, verified, created_by) values\n'
const TAIL = '\non conflict (source, source_ref) where source_ref is not null do update set name_he=excluded.name_he, name_en=excluded.name_en, kcal=excluded.kcal, protein=excluded.protein, carbs=excluded.carbs, fat=excluded.fat, fiber=excluded.fiber, units=excluded.units, search_text=excluded.search_text;\n'

fs.mkdirSync(outDir, { recursive: true })
for (const f of fs.readdirSync(outDir)) if (/^tzameret-\d+\.sql$/.test(f)) fs.unlinkSync(path.join(outDir, f))
const files = []
for (let i = 0; i < out.length; i += CHUNK) {
  const name = `tzameret-${String(files.length + 1).padStart(3, '0')}.sql`
  const body = out.slice(i, i + CHUNK).map(values).join(',\n')
  fs.writeFileSync(path.join(outDir, name), `-- Tzameret (Israel MoH) generic foods, rows ${i + 1}-${Math.min(i + CHUNK, out.length)}. Idempotent upsert.\n${HEAD}${body}${TAIL}`)
  files.push(name)
}

if (jsonPath) {
  fs.mkdirSync(path.dirname(path.resolve(jsonPath)), { recursive: true })
  const keys = ['source_ref', 'name_he', 'name_en', 'kcal', 'protein', 'carbs', 'fat', 'fiber', 'units', 'search_text']
  fs.writeFileSync(jsonPath, JSON.stringify(out.map((r) => Object.fromEntries(keys.map((k) => [k, r[k]])))))
  console.log(`json: ${jsonPath} (${fs.statSync(jsonPath).size} bytes)`)
}

// ---------------------------------------------------------------- summary

const totalSkipped = Object.values(skipped).reduce((a, b) => a + b, 0)
console.log(`rows read:      ${foods.length}`)
console.log(`rows written:   ${out.length}  (${files.length} files in ${outDir})`)
console.log(`rows skipped:   ${totalSkipped}`, JSON.stringify(skipped))
console.log(`with >=1 unit:  ${out.filter((r) => r.units.length).length}`)
console.log(`with name_en:   ${out.filter((r) => r.name_en).length}`)
console.log(`notes:          carbs missing->0: ${fillNoted.carbsMissing}, macros clamped: ${fillNoted.clamped}, fiber null: ${fillNoted.fiberNull}`)
console.log(`unit rows dropped: ${JSON.stringify(unitSkips)}`)

const want = [
  /^חזה עוף|בשר עוף, חזה, ללא עצם, צלוי, נאכל ללא עור/, /^אורז לבן, מבושל, ללא תוספת שומן/, /^ביצה קשה/, /^ביצה שלמה בלי קליפה/,
  /קוטג.*5%/, /^חומוס|^חומוס, /, /^פיתה/, /שיבולת שועל/, /^בננה, טריה/,
]
const picked = []
for (const re of want) {
  const r = out.find((x) => re.test(x.name_he || '') && !picked.includes(x))
  if (r) picked.push(r)
}
for (let i = 0; picked.length < 10 && i < out.length; i += Math.floor(out.length / 7) || 1) if (!picked.includes(out[i])) picked.push(out[i])
console.log('\nsamples (name | kcal P C F | units):')
for (const r of picked.slice(0, 10)) {
  console.log(`${r.source_ref} ${r.name_he} | ${r.kcal} ${r.protein} ${r.carbs} ${r.fat} | ${r.units.slice(0, 4).map((u) => `${u.he}=${u.g}`).join(', ') || '-'}`)
}
