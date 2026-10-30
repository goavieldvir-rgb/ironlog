import { supabase } from '../supabase.js'
import { rankFoods } from './foodRank.js'

// The whole foods list this account may see (about 18,000 rows, ~1 MB
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

const IDB_TIMEOUT_MS = 1500 // some WebViews never answer indexedDB.open

let mem = null // { uid, foods, savedAt, checkedAt, stamp }
let loading = null
// Foods added this session (id -> { uid, food }), so a list that was being
// fetched while they were added still has them.
const pending = new Map()

// ---- IndexedDB (best effort; private mode or blocked storage just means no cache)

let dbPromise = null
function idb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(new Error('no indexedDB'))
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => {
        const db = req.result
        // Let a newer version of the app upgrade the database.
        db.onversionchange = () => {
          db.close()
          dbPromise = null
        }
        resolve(db)
      }
      req.onerror = () => reject(req.error)
      req.onblocked = () => reject(new Error('indexedDB blocked'))
      setTimeout(() => reject(new Error('indexedDB timeout')), IDB_TIMEOUT_MS)
    })
    dbPromise.catch(() => {
      dbPromise = null
    })
  }
  return dbPromise
}

async function idbGet(key) {
  try {
    const db = await idb()
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(key)
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => reject(req.error)
      setTimeout(() => resolve(null), IDB_TIMEOUT_MS)
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

function withPending(uid, foods) {
  if (!pending.size) return foods
  const ids = new Set(foods.map((f) => f.id))
  const extra = [...pending.values()].filter((p) => p.uid === uid && !ids.has(p.food.id)).map((p) => p.food)
  return extra.length ? [...foods, ...extra] : foods
}

function keep(uid, foods, stamp, savedAt = Date.now()) {
  foods = withPending(uid, foods)
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
    // Signed out or switched account meanwhile: leave memory alone.
    if (loading?.uid !== uid) return stored?.foods || null
    if (stored?.foods?.length) {
      const foods = withPending(uid, stored.foods)
      mem = { uid, foods, stamp: stored.stamp, savedAt: stored.savedAt || 0, checkedAt: 0 }
      warm(foods)
      revalidate(uid)
      return foods
    }
    const { foods, stamp } = await fetchAll()
    if (loading?.uid !== uid) return foods
    return keep(uid, foods, stamp)
  })().finally(() => {
    if (loading?.promise === promise) loading = null
  })
  loading = { uid, promise }
  return promise
}

// A food added or changed in this session (label entry, Open Food Facts
// cache, approval) shows in search right away. The stamp moves with it (one
// more row, newest created_at) so the next check does not read our own add
// as a change; if another device also added a row the count differs and the
// list is refetched, as it should be.
export function upsertCatalogFood(food) {
  const uid = loading?.uid ?? mem?.uid
  if (!food?.id || !uid) return
  pending.set(food.id, { uid, food })
  if (mem?.uid !== uid) return
  const i = mem.foods.findIndex((f) => f.id === food.id)
  const foods = i >= 0 ? mem.foods.map((f, j) => (j === i ? food : f)) : [...mem.foods, food]
  let stamp = mem.stamp
  if (i < 0 && stamp && food.created_at) {
    const [count, newest] = stamp.split('|')
    const latest = newest && Date.parse(newest) > Date.parse(food.created_at) ? newest : food.created_at
    stamp = `${(Number(count) || 0) + 1}|${latest}`
  }
  mem = { ...mem, foods, stamp }
  // Stored once things settle, not on every add of a scanning spree.
  clearTimeout(storeTimer)
  storeTimer = setTimeout(() => {
    if (mem?.uid === uid && mem.stamp) idbPut(uid, { foods: mem.foods, stamp: mem.stamp, savedAt: mem.savedAt })
  }, 3000)
}
let storeTimer = 0

// Barcodes already in the catalog, so live Open Food Facts hits that we hold
// anyway are not listed twice.
const barcodeSets = new WeakMap()
export function catalogBarcodes(uid) {
  const foods = peekCatalog(uid)
  if (!foods) return null
  let set = barcodeSets.get(foods)
  if (!set) {
    set = new Set(foods.map((f) => f.barcode).filter(Boolean))
    barcodeSets.set(foods, set)
  }
  return set
}

export function catalogFood(uid, id) {
  return peekCatalog(uid)?.find((f) => f.id === id) || null
}
