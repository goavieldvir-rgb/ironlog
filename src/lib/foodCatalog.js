import { supabase } from '../supabase.js'
import { rankFoods } from './foodRank.js'

// The whole foods list this account may see (about 5,000 rows, ~250 KB
// gzipped), kept on the device so search answers on every keystroke without
// a network round trip and ranks over every candidate instead of the first
// 200. Stale-while-revalidate: a stored copy is used at once and refreshed
// in the background when the table changed.

const COLS = 'id,source,source_ref,barcode,name_he,name_en,brand,kcal,protein,carbs,fat,fiber,units,verified,created_by'
const PAGE = 1000
const CHECK_AFTER_MS = 10 * 60 * 1000 // look for changes at most every 10 minutes
const MAX_AGE_MS = 24 * 60 * 60 * 1000 // refetch in full once a day regardless (edits, approvals)
const DB_NAME = 'ironlog-foods'
const STORE = 'catalog'

let mem = null // { uid, foods, savedAt, checkedAt, stamp }
let loading = null

// ---- IndexedDB (best effort; private mode or blocked storage just means no cache)

function idb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no indexedDB'))
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbGet(key) {
  try {
    const db = await idb()
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(key)
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

async function idbPut(key, value) {
  try {
    const db = await idb()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(value, key)
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // ignore
  }
}

// ---- network

// Row count and newest row: changes when anyone adds a food.
async function fetchStamp() {
  const [{ count, error }, newest] = await Promise.all([
    supabase.from('foods').select('id', { count: 'exact', head: true }),
    supabase.from('foods').select('created_at').order('created_at', { ascending: false }).limit(1),
  ])
  if (error) throw error
  if (newest.error) throw newest.error
  return `${count}|${newest.data?.[0]?.created_at || ''}`
}

async function fetchAll() {
  const stamp = await fetchStamp()
  const count = Number(stamp.split('|')[0]) || 0
  const pages = []
  for (let from = 0; from < Math.max(count, 1); from += PAGE) {
    pages.push(supabase.from('foods').select(COLS).order('id').range(from, from + PAGE - 1))
  }
  const res = await Promise.all(pages)
  const foods = []
  const seen = new Set()
  for (const { data, error } of res) {
    if (error) throw error
    for (const f of data) {
      if (seen.has(f.id)) continue
      seen.add(f.id)
      foods.push(f)
    }
  }
  return { foods, stamp }
}

function keep(uid, foods, stamp, savedAt = Date.now()) {
  mem = { uid, foods, stamp, savedAt, checkedAt: Date.now() }
  idbPut(uid, { foods, stamp, savedAt })
  warm(foods)
  return foods
}

// The first search prepares every name (~150 ms on a phone); do it while idle.
function warm(foods) {
  const run = () => rankFoods(foods, 'a', { limit: 1 })
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 2000 })
  else setTimeout(run, 200)
}

async function revalidate(uid) {
  const m = mem
  if (!m || m.uid !== uid) return
  if (Date.now() - m.checkedAt < CHECK_AFTER_MS && Date.now() - m.savedAt < MAX_AGE_MS) return
  m.checkedAt = Date.now()
  try {
    const stale = Date.now() - m.savedAt >= MAX_AGE_MS || (await fetchStamp()) !== m.stamp
    if (!stale) return
    const { foods, stamp } = await fetchAll()
    if (mem?.uid === uid) keep(uid, foods, stamp)
  } catch (err) {
    console.error(err) // keep the copy we have
  }
}

// ---- public

// The catalog when it is already in memory for this account, else null.
export function peekCatalog(uid) {
  return mem && mem.uid === uid ? mem.foods : null
}

// Resolves to the catalog (from memory, the device, or the network) and
// refreshes it in the background when it may be out of date.
export function loadCatalog(uid) {
  if (!uid) return Promise.resolve(null)
  if (mem?.uid === uid) {
    revalidate(uid)
    return Promise.resolve(mem.foods)
  }
  if (loading?.uid === uid) return loading.promise
  const promise = (async () => {
    const stored = await idbGet(uid)
    if (stored?.foods?.length) {
      mem = { uid, foods: stored.foods, stamp: stored.stamp, savedAt: stored.savedAt || 0, checkedAt: 0 }
      warm(stored.foods)
      revalidate(uid)
      return stored.foods
    }
    const { foods, stamp } = await fetchAll()
    return keep(uid, foods, stamp)
  })().finally(() => {
    if (loading?.promise === promise) loading = null
  })
  loading = { uid, promise }
  return promise
}

// A food added or changed in this session (label entry, Open Food Facts
// cache, approval) shows in search right away.
export function upsertCatalogFood(food) {
  if (!mem || !food?.id) return
  const i = mem.foods.findIndex((f) => f.id === food.id)
  const foods = i >= 0 ? mem.foods.map((f, j) => (j === i ? food : f)) : [...mem.foods, food]
  mem = { ...mem, foods }
  idbPut(mem.uid, { foods, stamp: mem.stamp, savedAt: mem.savedAt })
}

export function catalogFood(uid, id) {
  return peekCatalog(uid)?.find((f) => f.id === id) || null
}
