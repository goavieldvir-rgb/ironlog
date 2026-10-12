import React, { useEffect, useRef, useState } from 'react'
import { Check, Loader2, Plus, ScanBarcode, Search, X, Zap } from 'lucide-react'
import { useLanguage } from '../../context/LanguageContext.jsx'
import { Button } from '../ui.jsx'
import {
  cacheOffFood,
  cloneLogs,
  fmt,
  foodName,
  friendlyError,
  getRecentLogs,
  getSavedMeals,
  FAV_EVENT,
  getFavorites,
  parseNum,
  searchFoods,
  searchOff,
  sumLogs,
  logName,
  queryLang,
} from '../../lib/nutrition.js'
import { AmountText, Forward, MacroInputs, MealTabs, MohAttribution, N, Name, OffAttribution, SheetHeader, SourceLabel, mealLabel, useDirtyForm } from './parts.jsx'

// Two-line row: name, then protein first, then kcal (quieter), then source.
function Stats({ protein, kcal, extra, source }) {
  const { t } = useLanguage()
  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5 text-xs text-chalkdim mt-0.5">
      {extra && <span className="whitespace-nowrap">{extra} ·</span>}
      <span className="whitespace-nowrap">
        <N mono className="text-irontext text-sm">{fmt(protein, 1)}</N> {t('nutrition.g')} {t('nutrition.proteinWord')}
      </span>
      <span className="whitespace-nowrap">
        · <N mono>{fmt(kcal, 0)}</N> {t('nutrition.kcalUnit')}
      </span>
      {source}
    </div>
  )
}

export default function AddFood({ meal, setMeal, uid, authUid, date, onClose, onScan, onPick, onLabel, onLog, onManageMeals }) {
  const { t, lang } = useLanguage()
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('recent')
  const [quickOpen, setQuickOpen] = useState(false)
  const [quick, setQuick] = useState({ protein: '', kcal: '', carbs: '', fat: '', name: '' })
  useDirtyForm(quickOpen && Object.values(quick).some((x) => String(x).trim() !== ''))
  const [quickErr, setQuickErr] = useState('')
  const [results, setResults] = useState(null) // null = not searching
  const [searching, setSearching] = useState(false)
  const [searchErr, setSearchErr] = useState('')
  const [recent, setRecent] = useState(null)
  const [meals, setMeals] = useState(null)
  const [favs, setFavs] = useState(null) // null = not loaded
  const [done, setDone] = useState({})
  const [online, setOnline] = useState([])
  const [onlineBusy, setOnlineBusy] = useState(false)
  const [onlineErr, setOnlineErr] = useState('')
  const [retryN, setRetryN] = useState(0)
  const [picking, setPicking] = useState(false)
  const seq = useRef(0)
  const q = query.trim()

  // Debounced search.
  useEffect(() => {
    const my = ++seq.current
    if (q.length < 2) {
      setResults(null)
      setSearching(false)
      setSearchErr('')
      return
    }
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const rows = await searchFoods(q)
        if (my !== seq.current) return
        setResults(rows)
        setSearchErr('')
      } catch (err) {
        if (my !== seq.current) return
        console.error(err)
        setSearchErr(friendlyError(err, t, 'nutrition.searchFailed'))
      } finally {
        if (my === seq.current) setSearching(false)
      }
    }, 250)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  // Online search (Open Food Facts allows few requests per minute): wait for
  // the typing to stop, and drop the request when the query changes.
  useEffect(() => {
    setOnline([])
    setOnlineErr('')
    if (q.length < 2) {
      setOnlineBusy(false)
      return
    }
    setOnlineBusy(true)
    const ctrl = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const rows = await searchOff(q, { signal: ctrl.signal, uid: authUid })
        if (ctrl.signal.aborted) return
        setOnline(rows)
      } catch (err) {
        if (ctrl.signal.aborted) return
        if (!err.rateLimited) console.error(err)
        setOnlineErr(err.rateLimited ? t('nutrition.onlineRate') : t('nutrition.onlineFailed'))
      } finally {
        if (!ctrl.signal.aborted) setOnlineBusy(false)
      }
    }, 700)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, retryN])

  async function pickOnline(row) {
    if (picking) return
    setPicking(true)
    try {
      onPick(await cacheOffFood(row))
    } finally {
      setPicking(false)
    }
  }

  const [listErr, setListErr] = useState('')
  useEffect(() => {
    let off = false
    getRecentLogs(uid)
      .then((r) => !off && setRecent(r))
      .catch((err) => {
        console.error(err)
        if (!off) {
          setRecent([])
          setListErr(friendlyError(err, t, 'nutrition.loadFailed'))
        }
      })
    getSavedMeals(uid)
      .then((m) => !off && setMeals(m))
      .catch((err) => {
        console.error(err)
        if (!off) setMeals([])
      })
    return () => {
      off = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid])

  // Favorites are saved to the account; reload when the tab opens and when
  // the star on the amount screen changes one.
  const [favN, setFavN] = useState(0)
  useEffect(() => {
    const bump = () => setFavN((n) => n + 1)
    window.addEventListener(FAV_EVENT, bump)
    return () => window.removeEventListener(FAV_EVENT, bump)
  }, [])
  useEffect(() => {
    if (tab !== 'favorites') return
    let off = false
    getFavorites(uid)
      .then((list) => {
        if (!off) setFavs(list)
      })
      .catch((err) => {
        console.error(err)
        if (!off) {
          setFavs((f) => f || [])
          setListErr(friendlyError(err, t, 'nutrition.loadFailed'))
        }
      })
    return () => {
      off = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, uid, favN])

  function flash(id) {
    setDone((d) => ({ ...d, [id]: true }))
    setTimeout(() => setDone((d) => ({ ...d, [id]: false })), 2500)
  }

  async function logRecent(r) {
    const rows = cloneLogs([r], { uid, date, meal })
    if (await onLog(rows, t('nutrition.added', { name: r.name }))) flash(r.id)
  }

  async function logMeal(m) {
    const items = Array.isArray(m.items) ? m.items : []
    if (!items.length) return
    const rows = cloneLogs(items, { uid, date, meal })
    if (await onLog(rows, t('nutrition.loggedToMeal', { meal: mealLabel(t, meal) }))) flash(m.id)
  }

  async function submitQuick(e) {
    e.preventDefault()
    const kcal = parseNum(quick.kcal)
    if (!Number.isFinite(kcal) || kcal < 0 || quick.kcal === '') return setQuickErr(t('nutrition.quickNeedKcal'))
    const n = (v) => (Number.isFinite(parseNum(v)) ? Math.max(0, parseNum(v)) : 0)
    const row = {
      user_id: uid,
      date,
      meal,
      food_id: null,
      name: quick.name.trim() || t('nutrition.quickAdd'),
      grams: null,
      unit_label: null,
      unit_qty: null,
      kcal: Math.round(kcal * 10) / 10,
      protein: n(quick.protein),
      carbs: n(quick.carbs),
      fat: n(quick.fat),
    }
    setQuickErr('')
    if (await onLog([row], t('nutrition.added', { name: row.name }))) {
      setQuick({ protein: '', kcal: '', carbs: '', fat: '', name: '' })
      setQuickOpen(false)
    }
  }

  // Results show names in the language the search was typed in.
  const qLang = queryLang(query, lang)
  const localCodes = new Set((results || []).map((r) => r.barcode).filter(Boolean))
  const shownOnline = online.filter((r) => !localCodes.has(r.barcode))
  const g = t('nutrition.g')
  const tabs = [
    ['recent', t('nutrition.tabRecent')],
    ['favorites', t('nutrition.tabFavorites')],
    ['meals', t('nutrition.tabMyMeals')],
  ]
  const hint = { recent: 'hintRecent', favorites: 'hintFavorites', meals: 'hintMeals' }[tab]
  const addBtn = (id, label, onClick) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`w-11 h-11 shrink-0 inline-flex items-center justify-center rounded-md border press ${done[id] ? 'border-good text-good bg-good/10' : 'border-line bg-surface2 text-chalk'}`}
    >
      {done[id] ? <Check size={20} /> : <Plus size={20} />}
    </button>
  )

  const f = (k) => ({
    value: quick[k],
    onChange: (e) => setQuick((s) => ({ ...s, [k]: e.target.value })),
  })

  return (
    <>
      <SheetHeader title={t('nutrition.addSheetTitle', { meal: mealLabel(t, meal) })} onClose={onClose} />
      <div className="px-4 pt-2 shrink-0">
        <MealTabs value={meal} onChange={setMeal} />
      </div>
      <div className="relative mx-4 mt-3 shrink-0">
        <Search size={18} className="absolute start-3 top-1/2 -translate-y-1/2 text-chalkdim pointer-events-none" aria-hidden="true" />
        <input
          type="search"
          dir="auto"
          aria-label={t('nutrition.searchLabel')}
          placeholder={t('nutrition.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full !ps-10 !pe-11 !min-h-[48px] text-base [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-cancel-button]:appearance-none"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} aria-label={t('nutrition.clear')} className="absolute end-0 top-0 w-12 h-12 inline-flex items-center justify-center text-chalkdim">
            <X size={18} />
          </button>
        )}
      </div>

      {results === null && !searchErr && (
        <>
          <div className="grid grid-cols-2 gap-2 mx-4 mt-3 shrink-0">
            <Button variant="subtle" className="min-h-[48px] whitespace-nowrap" onClick={onScan}>
              <ScanBarcode size={18} /> {t('nutrition.scanBarcode')}
            </Button>
            <Button variant="ghost" className="min-h-[48px] whitespace-nowrap" aria-expanded={quickOpen} onClick={() => setQuickOpen((v) => !v)}>
              <Zap size={18} /> {t('nutrition.quickAdd')}
            </Button>
          </div>
          {quickOpen && (
            <form onSubmit={submitQuick} className="mx-4 mt-3 p-4 rounded-xl bg-surface2/60 grid grid-cols-2 gap-3 shrink-0">
              <div className="col-span-2">
                <MacroInputs values={quick} onChange={(k, v) => setQuick((s) => ({ ...s, [k]: v }))} />
              </div>
              <label className="col-span-2 flex flex-col gap-1.5">
                <span className="text-sm text-chalkdim">{t('nutrition.quickName')}</span>
                <input dir="auto" {...f('name')} />
              </label>
              {quickErr && (
                <p className="col-span-2 text-sm text-chalk" role="alert">
                  {quickErr}
                </p>
              )}
              <Button type="submit" variant="brass" className="col-span-2 min-h-[48px]">
                <Plus size={18} /> {t('nutrition.add')}
              </Button>
            </form>
          )}
          <div className="flex mx-4 mt-3 border-b border-line shrink-0" role="tablist">
            {tabs.map(([k, label]) => (
              <button
                key={k}
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`flex-1 min-h-[46px] text-sm font-medium -mb-px border-b-2 ${tab === k ? 'border-chalk text-chalk' : 'border-transparent text-chalkdim'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
        {searchErr && (
          <p className="text-sm py-4" role="alert">
            {searchErr}
          </p>
        )}
        {results !== null && !searchErr && (
          <>
            {(results.length > 0 || searching || (!onlineBusy && !onlineErr && shownOnline.length === 0)) && (
              <p className="text-chalkdim text-xs py-3" role="status">
                {searching ? t('nutrition.searching') : `${results.length === 1 ? t('nutrition.resultsOne') : t('nutrition.resultsCount', { n: results.length })} · ${t('nutrition.valuesPer100')}`}
              </p>
            )}
            <ul className="divide-y divide-line">
              {results.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => onPick(r)} className="w-full flex items-center gap-3 py-2.5 min-h-[56px] text-start press-row">
                    <div className="min-w-0 flex-1">
                      <Name className="font-medium">{foodName(r, qLang)}</Name>
                      <Stats protein={r.protein} kcal={r.kcal} source={<>{r.brand && <>· <bdi>{r.brand}</bdi></>} · <SourceLabel food={r} /></>} />
                    </div>
                    <Forward size={20} className="text-chalkdim shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
            {results.some((r) => r.source === 'moh') && <MohAttribution className="mt-3" />}
            {(onlineBusy || onlineErr || shownOnline.length > 0) && (
              <h3 className="text-chalkdim text-xs pt-4 pb-1">{t('nutrition.fromOff')}</h3>
            )}
            {onlineBusy && (
              <p className="flex items-center gap-2 text-chalkdim text-sm py-3" role="status">
                <Loader2 size={16} className="animate-spin" aria-hidden="true" /> {t('nutrition.searchingOnline')}
              </p>
            )}
            {onlineErr && !onlineBusy && (
              <div className="flex items-center justify-between gap-2 py-2">
                <p className="text-chalkdim text-sm" role="status">{onlineErr}</p>
                <button type="button" onClick={() => setRetryN((n) => n + 1)} className="text-sm text-chalk underline underline-offset-2 min-h-[44px] px-1 shrink-0">
                  {t('nutrition.retry')}
                </button>
              </div>
            )}
            {shownOnline.length > 0 && (
              <>
                <ul className="divide-y divide-line">
                  {shownOnline.map((r) => (
                    <li key={r.source_ref}>
                      <button type="button" disabled={picking} onClick={() => pickOnline(r)} className="w-full flex items-center gap-3 py-2.5 min-h-[56px] text-start press-row">
                        <div className="min-w-0 flex-1">
                          <Name className="font-medium">{foodName(r, qLang)}</Name>
                          <Stats protein={r.protein} kcal={r.kcal} source={<>{r.brand && <>· <bdi>{r.brand}</bdi></>} · <SourceLabel food={r} /></>} />
                        </div>
                        <Forward size={20} className="text-chalkdim shrink-0" />
                      </button>
                    </li>
                  ))}
                </ul>
                <OffAttribution className="mt-3" />
              </>
            )}
            {!searching && !onlineBusy && !onlineErr && results.length === 0 && shownOnline.length === 0 && (
              <p className="text-chalkdim text-sm py-3">
                {t('nutrition.noResults', { q })} {t('nutrition.noResultsHint')}
              </p>
            )}
            {shownOnline.length === 0 && results.some((r) => r.source === 'off') && <OffAttribution className="mt-3" />}
            <Button variant="ghost" className="w-full mt-4 min-h-[48px]" onClick={() => onLabel()}>
              <Plus size={18} /> {t('nutrition.addFromLabel')}
            </Button>
          </>
        )}

        {results === null && !searchErr && (
          <>
            <div className="flex items-center justify-between gap-2 py-2.5">
              <p className="text-chalkdim text-xs">{t(`nutrition.${hint}`)}</p>
              {tab === 'meals' && (
                <button type="button" onClick={onManageMeals} className="text-sm text-chalk underline underline-offset-2 min-h-[44px] px-1">
                  {t('nutrition.manageMeals')}
                </button>
              )}
            </div>
            {tab === 'recent' && (
              <>
                {listErr && <p className="text-sm py-2" role="alert">{listErr}</p>}
                {recent && recent.length === 0 && !listErr && <p className="text-chalkdim text-sm py-2">{t('nutrition.emptyRecent')}</p>}
                <ul className="divide-y divide-line">
                  {(recent || []).map((r) => (
                    <li key={r.id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <Name className="font-medium">{logName(r, lang)}</Name>
                        <Stats protein={r.protein} kcal={r.kcal} extra={r.grams != null ? <AmountText row={r} /> : null} />
                      </div>
                      {addBtn(r.id, t('nutrition.add'), () => logRecent(r))}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {tab === 'favorites' && (
              <>
                {listErr && <p className="text-sm py-2" role="alert">{listErr}</p>}
                {favs && favs.length === 0 && !listErr && <p className="text-chalkdim text-sm py-2">{t('nutrition.emptyFavorites')}</p>}
                <ul className="divide-y divide-line">
                  {(favs || []).map((r) => (
                    <li key={r.id}>
                      <button type="button" onClick={() => onPick(r)} className="w-full flex items-center gap-3 py-2.5 min-h-[56px] text-start press-row">
                        <div className="min-w-0 flex-1">
                          <Name className="font-medium">{foodName(r, lang)}</Name>
                          <Stats protein={r.protein} kcal={r.kcal} source={<>· <SourceLabel food={r} /></>} />
                        </div>
                        <Forward size={20} className="text-chalkdim shrink-0" />
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {tab === 'meals' && (
              <>
                {meals && meals.length === 0 && <p className="text-chalkdim text-sm py-2">{t('nutrition.emptyMeals')}</p>}
                <ul className="divide-y divide-line">
                  {(meals || []).map((m) => {
                    const tot = sumLogs(m.items || [])
                    const n = (m.items || []).length
                    return (
                      <li key={m.id} className="flex items-center gap-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <Name className="font-medium">{m.name}</Name>
                          <Stats protein={tot.protein} kcal={tot.kcal} extra={n === 1 ? t('nutrition.itemsOne') : t('nutrition.itemsMany', { n })} />
                        </div>
                        {addBtn(m.id, t('nutrition.add'), () => logMeal(m))}
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </>
  )
}
