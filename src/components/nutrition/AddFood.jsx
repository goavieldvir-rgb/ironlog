import React, { useEffect, useRef, useState } from 'react'
import { Check, Plus, ScanBarcode, Search, X, Zap } from 'lucide-react'
import { useLanguage } from '../../context/LanguageContext.jsx'
import { Button } from '../ui.jsx'
import {
  cloneLogs,
  fmt,
  foodName,
  friendlyError,
  getRecentLogs,
  getSavedMeals,
  loadFavorites,
  parseNum,
  searchFoods,
  sumLogs,
} from '../../lib/nutrition.js'
import { AmountText, Forward, MealSelect, N, Name, OffAttribution, SheetHeader, SourceLabel, mealLabel } from './parts.jsx'

// Two-line row: name, then protein first, then kcal (quieter), then source.
function Stats({ protein, kcal, extra, source }) {
  const { t } = useLanguage()
  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5 text-xs text-chalkdim mt-0.5">
      {extra && <span className="whitespace-nowrap">{extra} ·</span>}
      <span className="whitespace-nowrap">
        <N mono className="text-chalk text-sm">{fmt(protein, 1)}</N> {t('nutrition.g')} {t('nutrition.proteinWord')}
      </span>
      <span className="whitespace-nowrap">
        · <N mono>{fmt(kcal, 0)}</N> {t('nutrition.kcalUnit')}
      </span>
      {source}
    </div>
  )
}

export default function AddFood({ meal, setMeal, uid, date, onClose, onScan, onPick, onLabel, onLog, onManageMeals }) {
  const { t, lang } = useLanguage()
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('recent')
  const [quickOpen, setQuickOpen] = useState(false)
  const [quick, setQuick] = useState({ protein: '', kcal: '', carbs: '', fat: '', name: '' })
  const [quickErr, setQuickErr] = useState('')
  const [results, setResults] = useState(null) // null = not searching
  const [searching, setSearching] = useState(false)
  const [searchErr, setSearchErr] = useState('')
  const [recent, setRecent] = useState(null)
  const [meals, setMeals] = useState(null)
  const [favs, setFavs] = useState(() => loadFavorites(uid))
  const [done, setDone] = useState({})
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

  // Favorites may have changed on the amount screen.
  useEffect(() => {
    if (tab === 'favorites') setFavs(loadFavorites(uid))
  }, [tab, uid])

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
        <MealSelect value={meal} onChange={setMeal} />
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
            <form onSubmit={submitQuick} className="mx-4 mt-3 p-3 rounded-lg border border-line bg-ink grid grid-cols-2 gap-2.5 shrink-0">
              {[
                ['protein', 'quickProtein', 'decimal'],
                ['kcal', 'quickKcal', 'decimal'],
                ['carbs', 'quickCarbs', 'decimal'],
                ['fat', 'quickFat', 'decimal'],
              ].map(([k, label, mode]) => (
                <label key={k} className="flex flex-col gap-1">
                  <span className="text-xs text-chalkdim">{t(`nutrition.${label}`)}</span>
                  <input inputMode={mode} dir="ltr" placeholder="0" className="num text-center" {...f(k)} />
                </label>
              ))}
              <label className="col-span-2 flex flex-col gap-1">
                <span className="text-xs text-chalkdim">{t('nutrition.quickName')}</span>
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

      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6">
        {searchErr && (
          <p className="text-sm py-4" role="alert">
            {searchErr}
          </p>
        )}
        {results !== null && !searchErr && (
          <>
            <p className="text-chalkdim text-xs py-3" role="status">
              {searching ? t('nutrition.searching') : `${results.length === 1 ? t('nutrition.resultsOne') : t('nutrition.resultsCount', { n: results.length })} · ${t('nutrition.valuesPer100')}`}
            </p>
            <ul className="divide-y divide-line">
              {results.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => onPick(r)} className="w-full flex items-center gap-3 py-2.5 min-h-[56px] text-start press-row">
                    <div className="min-w-0 flex-1">
                      <Name className="font-medium">{foodName(r, lang)}</Name>
                      <Stats protein={r.protein} kcal={r.kcal} source={<>{r.brand && <>· <bdi>{r.brand}</bdi></>} · <SourceLabel food={r} /></>} />
                    </div>
                    <Forward size={20} className="text-chalkdim shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
            {!searching && results.length === 0 && <p className="text-chalkdim text-sm py-3">{t('nutrition.noResults', { q })}</p>}
            {results.some((r) => r.source === 'off') && <OffAttribution className="mt-3" />}
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
                        <Name className="font-medium">{r.name}</Name>
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
                {favs.length === 0 && <p className="text-chalkdim text-sm py-2">{t('nutrition.emptyFavorites')}</p>}
                <ul className="divide-y divide-line">
                  {favs.map((r) => (
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
