import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { BarChart3, Bookmark, Check, ChevronLeft, ChevronRight, Copy, CopyPlus, Pencil, Plus, Repeat, ScanBarcode } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { useAdmin } from '../context/AdminContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFeedback } from '../context/FeedbackContext.jsx'
import { fmtDate, toLocalISODate } from '../lib/dates.js'
import { shiftDay } from '../lib/nutritionStats.js'
import {
  MEALS,
  MEAL_KEY,
  buildUnitOptions,
  cloneLogs,
  defaultMeal,
  deleteLogs,
  fmt,
  foodLogRow,
  friendlyError,
  getLogs,
  getLogsBetween,
  getTargets,
  insertLogs,
  isNotSetUp,
  saveMeal,
  saveTargets,
  sumLogs,
  updateLog,
  logName,
} from '../lib/nutrition.js'
import { Button, Card, LoadError } from './ui.jsx'
import { AmountText, DirtyScope, Forward, N, Name, Sheet, Track, UndoToast, useDiscardGuard } from './nutrition/parts.jsx'
import { loadCatalog } from '../lib/foodCatalog.js'
import AddFood from './nutrition/AddFood.jsx'
import FoodDetail from './nutrition/FoodDetail.jsx'
import LabelForm from './nutrition/LabelForm.jsx'
import Scanner from './nutrition/Scanner.jsx'
import Trends from './nutrition/Trends.jsx'
import Water from './nutrition/Water.jsx'
import { EditLog, MyMealsView, SaveMealView, TargetsView } from './nutrition/Views.jsx'

// Nutrition diary (beta). Scanner and sheets are overlays inside this page on
// purpose: changing the URL hash while the camera is open makes iOS WebKit ask
// for camera permission again (WebKit bug 215884).

export default function Nutrition() {
  const { nutritionAllowed, loadingProfile } = useAdmin()
  if (loadingProfile) return null
  if (!nutritionAllowed) return <Navigate to="/" replace />
  return <Diary />
}

// Days already seen in this app session, so returning to the page or
// stepping back a day shows the diary at once while it refreshes.
const dayCache = new Map() // `${uid}|${date}` -> logs
const targetsCache = new Map() // uid -> targets

// How far ahead the diary lets you plan meals.
const MAX_DAYS_AHEAD = 30
// How far back the copy buttons look for a day or meal to repeat.
const COPY_LOOKBACK = 14

function Diary() {
  const { t, lang } = useLanguage()
  const { user } = useAuth()
  const { isAdmin, effectiveUid, actingAs } = useAdmin()
  const { confirm, toast } = useFeedback()
  const uid = effectiveUid
  const today = toLocalISODate()
  const [date, setDate] = useState(today)
  const [logs, setLogs] = useState([])
  // Logs from the days before this one, newest day first: the copy sources.
  const [prevLogs, setPrevLogs] = useState([])
  const [targets, setTargets] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [reloadN, setReloadN] = useState(0)
  const [stack, setStack] = useState([])
  const [scanner, setScanner] = useState(false)
  const [meal, setMeal] = useState(() => defaultMeal())
  const [undoToast, setUndoToast] = useState(null)
  const toastTimer = useRef(0)
  const loadedFor = useRef('')
  // The day the `logs` state belongs to, for writing edits back to dayCache.
  const logsFor = useRef('')
  const adding = useRef(false)

  // A PWA resumed the next morning still shows yesterday as "Today": move
  // to the new day when the app comes back, if it was showing today.
  const shownToday = useRef(today)
  shownToday.current = today
  useEffect(() => {
    const onShow = () => {
      if (document.visibilityState !== 'visible') return
      const now = toLocalISODate()
      setDate((d) => (d === shownToday.current && d !== now ? now : d))
    }
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, [])

  // Load the day, the two weeks before it (for "copy"), and the targets.
  useEffect(() => {
    if (!uid) return
    let off = false
    const key = `${uid}|${date}`
    const prevKey = `${uid}|before|${date}`
    if (loadedFor.current !== key) {
      if (dayCache.has(key)) {
        loadedFor.current = key
        logsFor.current = key
        setLogs(dayCache.get(key))
        setPrevLogs(dayCache.get(prevKey) || [])
        setTargets(targetsCache.get(uid) ?? null)
        setLoadError(null)
        setLoading(false)
      } else setLoading(true)
    }
    Promise.all([getLogs(uid, date), getLogsBetween(uid, shiftDay(date, -COPY_LOOKBACK), shiftDay(date, -1)), getTargets(uid)])
      .then(([day, prev, tg]) => {
        if (off) return
        loadedFor.current = key
        logsFor.current = key
        dayCache.set(prevKey, prev || [])
        targetsCache.set(uid, tg || null)
        setLogs(day || [])
        setPrevLogs(prev || [])
        setTargets(tg || null)
        setLoadError(null)
        setLoading(false)
      })
      .catch((err) => {
        if (off) return
        console.error(err)
        setLoadError(err)
        setLoading(false)
      })
    return () => {
      off = true
    }
  }, [uid, date, reloadN])

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  // Keep the cache in step with edits made on the page. Runs only when the
  // logs change, so a day switch never files the old day's logs under the new.
  useEffect(() => {
    if (logsFor.current) dayCache.set(logsFor.current, logs)
  }, [logs])

  // Fetch the food list for search while the diary is idle, so the add sheet
  // searches on the first keystroke.
  useEffect(() => {
    // Saving data: wait until search is opened.
    if (!user?.uid || navigator.connection?.saveData) return
    const run = () => loadCatalog(user.uid).catch((err) => console.error(err))
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(run, { timeout: 4000 })
      return () => cancelIdleCallback(id)
    }
    const id = setTimeout(run, 1500)
    return () => clearTimeout(id)
  }, [user?.uid])

  const reload = useCallback(() => setReloadN((n) => n + 1), [])

  // onUndo replaces the default undo (deleting the food log ids), e.g. for water.
  function showToast(message, ids, onUndo) {
    clearTimeout(toastTimer.current)
    setUndoToast({ message, ids, onUndo })
    toastTimer.current = setTimeout(() => setUndoToast(null), ids?.length ? 7000 : 2800)
  }

  async function undo() {
    const ids = undoToast?.ids || []
    const onUndo = undoToast?.onUndo
    clearTimeout(toastTimer.current)
    setUndoToast(null)
    try {
      if (onUndo) return await onUndo()
      await deleteLogs(ids)
      // A copy to today may be undone while another day is on screen.
      dayCache.delete(`${uid}|${today}`)
    } catch (err) {
      console.error(err)
      toast(friendlyError(err, t), 'error')
    }
    reload()
  }

  // Inserts rows into the diary and offers undo. Resolves true on success.
  // A second tap while the first insert is on its way is ignored, so a slow
  // connection can't log the same food or day twice.
  async function addLogs(rows, message) {
    if (adding.current) return false
    adding.current = true
    try {
      const inserted = await insertLogs(rows)
      // Rows for another day (copy to today) make that day's cache stale.
      for (const r of rows) if (r.date !== date) dayCache.delete(`${uid}|${r.date}`)
      showToast(message, inserted.map((r) => r.id))
      reload()
      return true
    } catch (err) {
      console.error(err)
      toast(friendlyError(err, t), 'error')
      return false
    } finally {
      adding.current = false
    }
  }

  // ----- sheet stack
  const push = (view) => setStack((s) => [...s, view])
  const pop = useCallback(() => setStack((s) => s.slice(0, -1)), [])
  const closeAll = useCallback(() => setStack([]), [])
  // Back, X, Escape and a tap outside ask first when a form has typed values.
  const guard = useDiscardGuard()
  const depth = useRef(0)
  depth.current = stack.length
  const requestPop = useCallback(async () => {
    if (await guard.ask([depth.current - 1])) pop()
  }, [guard, pop])
  const requestCloseAll = useCallback(async () => {
    if (await guard.ask()) closeAll()
  }, [guard, closeAll])
  const openAdd = (m) => {
    if (m) setMeal(m)
    setStack([{ type: 'add' }])
  }
  const openScanner = (m) => {
    if (m) setMeal(m)
    setScanner(true)
  }

  // After a food is logged, go back to the add sheet (search and all) so the
  // next food of the meal is one search away; close only when it wasn't open.
  const backToAdd = () =>
    setStack((s) => {
      const i = s.findIndex((v) => v.type === 'add')
      return i >= 0 ? s.slice(0, i + 1) : []
    })

  async function logFood(food, option, qty, m) {
    const row = foodLogRow({ uid, date, meal: m, food, lang, option, qty })
    if (await addLogs([row], t('nutrition.added', { name: row.name }))) {
      setScanner(false)
      backToAdd()
    }
  }

  async function onLabelSaved(food) {
    const options = buildUnitOptions(food, lang, t)
    const option = options.find((o) => o.kind === 'unit') || options.find((o) => o.kind === '100g')
    const row = foodLogRow({ uid, date, meal, food, lang, option, qty: 1 })
    if (await addLogs([row], t('nutrition.added', { name: row.name }))) backToAdd()
  }

  async function copyPrevious() {
    const rows = cloneLogs(prevDay.rows, { uid, date })
    await addLogs(rows, t('nutrition.copied', { n: rows.length }))
  }

  // The last time this meal was logged, into the same meal on this day.
  async function copyPrevMeal(m) {
    const rows = cloneLogs(prevMeal(m).rows, { uid, date })
    await addLogs(rows, t('nutrition.loggedToMeal', { meal: t(MEAL_KEY[m]) }))
  }

  // From a past day: the same meal, added to today.
  async function copyMealToToday(m) {
    const rows = cloneLogs(logs.filter((r) => r.meal === m), { uid, date: today })
    await addLogs(rows, t('nutrition.copiedToToday', { meal: t(MEAL_KEY[m]) }))
  }

  async function onSaveTargets(values) {
    try {
      const saved = await saveTargets(uid, values)
      setTargets(saved)
      targetsCache.set(uid, saved)
      showToast(t('nutrition.targetsSaved'))
      pop()
    } catch (err) {
      console.error(err)
      toast(friendlyError(err, t), 'error')
    }
  }

  async function onSaveEdit(id, patch) {
    try {
      await updateLog(id, patch)
      reload()
      closeAll()
    } catch (err) {
      console.error(err)
      toast(friendlyError(err, t), 'error')
    }
  }

  async function onDeleteLog(id) {
    if (!(await confirm({ title: t('nutrition.deleteTitle'), body: t('nutrition.deleteBody'), confirmLabel: t('nutrition.delete'), danger: true }))) return
    try {
      await deleteLogs([id])
      reload()
      closeAll()
    } catch (err) {
      console.error(err)
      toast(friendlyError(err, t), 'error')
    }
  }

  async function onSaveMeal(m, name) {
    try {
      await saveMeal(uid, name, logs.filter((r) => r.meal === m))
      showToast(t('nutrition.mealSaved'))
      pop()
    } catch (err) {
      console.error(err)
      toast(friendlyError(err, t), 'error')
    }
  }

  // ----- derived
  const totals = sumLogs(logs)
  // Copy sources: the last day anything was logged, and per meal the last day
  // that meal was. Usually yesterday; a skipped day falls back further.
  const lastDayOf = (rows) => (rows.length ? { date: rows[0].date, rows: rows.filter((r) => r.date === rows[0].date) } : null)
  const prevDay = lastDayOf(prevLogs)
  const prevMeal = (m) => lastDayOf(prevLogs.filter((r) => r.meal === m))
  const prevTotals = sumLogs(prevDay?.rows || [])
  const isToday = date === today
  // ISO dates compare as strings, so a later day sorts after today.
  const isFuture = date > today
  const isPast = date < today
  const tomorrow = shiftDay(today, 1)
  const lastDay = shiftDay(today, MAX_DAYS_AHEAD)
  // Time of day says nothing about a planned day: start from breakfast.
  const addMeal = () => (isFuture ? 'breakfast' : defaultMeal())
  const dateObj = new Date(date + 'T00:00:00')
  const dayLabel = isToday
    ? t('nutrition.today')
    : date === shiftDay(today, -1)
      ? t('nutrition.yesterday')
      : date === tomorrow
        ? t('nutrition.tomorrow')
        : fmtDate(lang, dateObj, { weekday: 'long' })
  const dateLine = fmtDate(lang, dateObj, { weekday: 'short', day: 'numeric', month: 'long' })
  const g = t('nutrition.g')
  const k = t('nutrition.kcalUnit')
  const notSetUp = loadError && isNotSetUp(loadError)

  // A copy source's day, as the buttons name it.
  const sourceDay = (iso) =>
    iso === today
      ? 'today'
      : iso === shiftDay(today, -1)
        ? 'yesterday'
        : fmtDate(lang, new Date(iso + 'T00:00:00'), { weekday: 'short', day: 'numeric', month: 'short' })
  const targetsKnown = !loading && !loadError

  return (
    <div className="nutrition-page flex flex-col gap-5 max-w-xl mx-auto w-full pb-[120px]">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          {actingAs && <div className="eyebrow mb-1"><bdi>{actingAs.name || actingAs.email}</bdi></div>}
          <h1 className="text-[30px] leading-9 font-semibold truncate">{dayLabel}</h1>
          <p className="text-chalkdim text-[15px] flex items-center gap-2">
            <bdi>{dateLine}</bdi>
            {isFuture && <span className="text-xs text-chalkdim bg-surface2 rounded-full px-2 py-0.5 whitespace-nowrap">{t('nutrition.planned')}</span>}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!isToday && (
            <button type="button" onClick={() => setDate(today)} className="min-h-[44px] px-4 rounded-full text-sm text-chalk bg-surface hover:bg-surface2 press">
              {t('nutrition.today')}
            </button>
          )}
          <button type="button" onClick={() => setDate(shiftDay(date, -1))} aria-label={t('nutrition.prevDay')} className="w-11 h-11 inline-flex items-center justify-center rounded-full bg-surface hover:bg-surface2 press">
            <span className="rtl:hidden"><ChevronLeft size={20} /></span>
            <span className="ltr:hidden"><ChevronRight size={20} /></span>
          </button>
          <button type="button" disabled={date >= lastDay} onClick={() => setDate(shiftDay(date, 1))} aria-label={t('nutrition.nextDay')} className="w-11 h-11 inline-flex items-center justify-center rounded-full bg-surface hover:bg-surface2 press disabled:text-[#4A4A50] disabled:pointer-events-none">
            <span className="rtl:hidden"><ChevronRight size={20} /></span>
            <span className="ltr:hidden"><ChevronLeft size={20} /></span>
          </button>
        </div>
      </div>

      {loading && <p className="eyebrow animate-pulse">{t('common.loading')}</p>}
      {loadError && notSetUp && (
        <div className="card p-4" role="alert">
          <p className="text-sm">{t('nutrition.notSetUp')}</p>
        </div>
      )}
      {loadError && !notSetUp && (
        <div>
          <LoadError onRetry={reload} />
        </div>
      )}

      {targetsKnown && (
        <>
          <Summary totals={totals} targets={targets} isAdmin={isAdmin} onEdit={() => push({ type: 'targets' })} />
          <button type="button" onClick={() => push({ type: 'trends' })} className="card w-full flex items-center gap-3 px-4 min-h-[52px] -mt-2 text-start hover:bg-surface2 press-row">
            <BarChart3 size={18} className="text-chalkdim shrink-0" aria-hidden="true" />
            <span className="flex-1 min-w-0 truncate text-sm">{t('nutrition.averagesOpen')}</span>
            <Forward size={18} className="text-chalkdim shrink-0" aria-hidden="true" />
          </button>
          {!targets && (
            <Card className="flex flex-col gap-2">
              {isAdmin ? (
                <>
                  <h2 className="text-lg">{t('nutrition.noTargetsTitle')}</h2>
                  <p className="text-chalkdim text-sm">{t('nutrition.noTargetsBody')}</p>
                  <div>
                    <Button variant="ghost" onClick={() => push({ type: 'targets' })}>
                      {t('nutrition.setTargets')}
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-chalkdim">{t('nutrition.coachWillSet')}</p>
              )}
            </Card>
          )}

          <div className="flex gap-2.5">
            <Button variant="brass" className="flex-1 h-[52px] text-base" onClick={() => openAdd(addMeal())}>
              <Plus size={18} strokeWidth={2.2} /> {t('nutrition.addFood')}
            </Button>
            <Button variant="subtle" className="w-[52px] h-[52px] !p-0 shrink-0" onClick={() => openScanner(addMeal())} aria-label={t('nutrition.scan')} title={t('nutrition.scan')}>
              <ScanBarcode size={22} strokeWidth={1.75} />
            </Button>
          </div>

          {/* The whole day only copies onto an empty day, so nothing is logged
              twice; each empty meal offers its own copy below. */}
          {prevDay && logs.length === 0 && (
            <Card className="flex items-center justify-between gap-3 !py-3">
              <div className="min-w-0">
                <div className="eyebrow"><bdi>{dayWord(t, sourceDay(prevDay.date))}</bdi></div>
                <p className="text-sm mt-0.5 whitespace-nowrap">
                  <N mono>{fmt(prevTotals.protein, 1)}</N> {g} {t('nutrition.proteinWord')}
                </p>
                <p className="text-chalkdim text-xs whitespace-nowrap">
                  <N mono>{fmt(prevTotals.kcal, 0)}</N> {k}
                </p>
              </div>
              <Button variant="ghost" className="shrink-0 whitespace-nowrap" onClick={copyPrevious}>
                <Copy size={16} /> {copyLabel(t, sourceDay(prevDay.date))}
              </Button>
            </Card>
          )}

          {/* Water is logged as you drink it, so a planned day has none. */}
          {!isFuture && <Water uid={uid} date={date} today={today} onPickDate={setDate} onToast={showToast} />}

          {MEALS.map((m) => {
            const rows = logs.filter((r) => r.meal === m)
            const mk = sumLogs(rows).kcal
            return (
              <section key={m} aria-labelledby={`meal-${m}`} className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <h2 id={`meal-${m}`} className="text-[17px] font-semibold flex items-baseline gap-2 min-w-0">
                    <span className="truncate">{t(MEAL_KEY[m])}</span>
                    {mk > 0 && (
                      <span className="text-chalkdim text-sm font-normal whitespace-nowrap">
                        <N mono>{fmt(mk, 0)}</N> {k}
                      </span>
                    )}
                  </h2>
                  <div className="flex items-center gap-1 shrink-0">
                    {isPast && rows.length > 0 && (
                      <button type="button" onClick={() => copyMealToToday(m)} aria-label={t('nutrition.copyMealToToday', { meal: t(MEAL_KEY[m]) })} title={t('nutrition.copyToTodayShort')} className="w-11 h-11 -my-1 inline-flex items-center justify-center rounded-full text-chalkdim hover:text-chalk press">
                        <CopyPlus size={18} />
                      </button>
                    )}
                    {rows.length > 0 && (
                      <button type="button" onClick={() => push({ type: 'saveMeal', meal: m })} aria-label={`${t('nutrition.saveAsMeal')}: ${t(MEAL_KEY[m])}`} title={t('nutrition.saveAsMeal')} className="w-11 h-11 -my-1 inline-flex items-center justify-center rounded-full text-chalkdim hover:text-chalk press">
                        <Bookmark size={18} />
                      </button>
                    )}
                    <button type="button" onClick={() => openAdd(m)} aria-label={t('nutrition.addToMealLabel', { meal: t(MEAL_KEY[m]) })} className="hit w-9 h-9 inline-flex items-center justify-center rounded-full bg-surface2 hover:bg-white/10 press">
                      <Plus size={16} strokeWidth={2} />
                    </button>
                  </div>
                </div>
                {rows.length === 0 && prevMeal(m) ? (
                  <RepeatMeal rows={prevMeal(m).rows} day={sourceDay(prevMeal(m).date)} meal={t(MEAL_KEY[m])} onClick={() => copyPrevMeal(m)} />
                ) : rows.length === 0 ? (
                  <p className="text-chalkdim text-sm">{isFuture ? t('nutrition.nothingPlanned') : t('nutrition.nothingLogged')}</p>
                ) : (
                  <ul className="bg-surface rounded-[18px] overflow-hidden divide-y divide-white/[0.06]">
                    {rows.map((r) => (
                      <li key={r.id}>
                        <button type="button" onClick={() => push({ type: 'edit', row: r })} className="w-full flex items-center justify-between gap-3 px-4 min-h-[60px] py-2 text-start hover:bg-surface2 press-row">
                          <div className="min-w-0 flex-1">
                            <span dir="auto" className="block truncate text-[15px] leading-5 font-medium text-start">{logName(r, lang)}</span>
                            {r.grams != null && (
                              <span className="block text-chalkdim text-[13px] leading-[18px] truncate">
                                <AmountText row={r} />
                              </span>
                            )}
                          </div>
                          <div className="text-end shrink-0">
                            <div className="whitespace-nowrap text-[15px] font-semibold">
                              <N mono>{fmt(r.protein, 1)}</N> <span>{g}</span>
                            </div>
                            <div className="text-chalkdim text-[13px] whitespace-nowrap">
                              <N mono>{fmt(r.kcal, 0)}</N> {k}
                            </div>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </>
      )}

      {stack.length > 0 && (
        <Sheet onClose={requestCloseAll} label={t('nutrition.title')}>
          {stack.map((v, i) => {
            const isTop = i === stack.length - 1
            const common = { onClose: requestCloseAll, onBack: i > 0 ? requestPop : undefined }
            let body = null
            switch (v.type) {
              case 'add':
                body = (
                  <AddFood
                    meal={meal}
                    setMeal={setMeal}
                    uid={uid}
                    authUid={user.uid}
                    date={date}
                    today={today}
                    onClose={requestCloseAll}
                    onScan={() => setScanner(true)}
                    onPick={(food) => push({ type: 'detail', food })}
                    onLabel={() => push({ type: 'label', barcode: '' })}
                    onLog={addLogs}
                    onManageMeals={() => push({ type: 'meals' })}
                  />
                )
                break
              case 'detail':
                body = <FoodDetail {...common} food={v.food} meal={meal} setMeal={setMeal} targets={targets} totals={totals} favUid={uid} isAdmin={isAdmin} onLog={logFood} />
                break
              case 'label':
                body = (
                  <LabelForm
                    {...common}
                    barcode={v.barcode}
                    prefill={v.prefill}
                    uid={user.uid}
                    isAdmin={isAdmin}
                    onSaved={onLabelSaved}
                    onUseExisting={(food) => setStack((s) => [...s.slice(0, -1), { type: 'detail', food }])}
                  />
                )
                break
              case 'edit':
                body = <EditLog {...common} row={v.row} onSave={onSaveEdit} onDelete={onDeleteLog} />
                break
              case 'targets':
                body = <TargetsView {...common} targets={targets} onSave={onSaveTargets} />
                break
              case 'saveMeal':
                body = (
                  <SaveMealView
                    {...common}
                    defaultName={t(MEAL_KEY[v.meal])}
                    count={logs.filter((r) => r.meal === v.meal).length}
                    onSave={(name) => onSaveMeal(v.meal, name)}
                  />
                )
                break
              case 'trends':
                body = <Trends {...common} uid={uid} today={today} targets={targets} />
                break
              case 'meals':
                body = <MyMealsView {...common} uid={uid} date={date} meal={meal} setMeal={setMeal} onLog={addLogs} />
                break
              default:
                break
            }
            return (
              <div key={i} className={`${isTop ? 'flex' : 'hidden'} flex-col flex-1 min-h-0`}>
                <DirtyScope guard={guard} id={i}>
                  {body}
                </DirtyScope>
              </div>
            )
          })}
        </Sheet>
      )}

      {scanner && (
        <Scanner
          uid={user.uid}
          meal={meal}
          setMeal={setMeal}
          onClose={() => setScanner(false)}
          onNotFound={(code, prefill) => {
            setScanner(false)
            const view = { type: 'label', barcode: code, prefill }
            setStack((s) => (s.length ? [...s, view] : [view]))
          }}
          onAdd={logFood}
        />
      )}

      <UndoToast toast={undoToast} onUndo={undo} />
    </div>
  )
}

// 'today' / 'yesterday' / a short date -> words for the copy buttons.
const dayWord = (t, day) => (day === 'today' ? t('nutrition.today') : day === 'yesterday' ? t('nutrition.yesterday') : day)
const copyLabel = (t, day) =>
  day === 'today' ? t('nutrition.copyToday') : day === 'yesterday' ? t('nutrition.copyYesterday') : t('nutrition.copyDay', { day })

// An empty meal that was logged on an earlier day: one tap logs it again.
function RepeatMeal({ rows, day, meal, onClick }) {
  const { t, lang } = useLanguage()
  const tot = sumLogs(rows)
  const dayIn = day === 'today' ? t('nutrition.fromToday') : day === 'yesterday' ? t('nutrition.fromYesterday') : t('nutrition.fromDay', { day })
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t('nutrition.repeatMealLabel', { meal, day: dayIn })}
      className="w-full flex items-center gap-3 px-4 min-h-[56px] py-2 rounded-[18px] border border-dashed border-white/[0.14] text-start hover:bg-surface press-row"
    >
      <Repeat size={18} className="text-chalkdim shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <span className="block text-[15px] leading-5 font-medium">
          {day === 'today' ? t('nutrition.repeatMealToday') : day === 'yesterday' ? t('nutrition.repeatMealYesterday') : t('nutrition.repeatMealDay', { day })}
        </span>
        <span dir="auto" className="block text-chalkdim text-[13px] leading-[18px] truncate text-start">
          {rows.map((r) => logName(r, lang)).join(', ')}
        </span>
      </div>
      <div className="text-end shrink-0 text-[13px] text-chalkdim whitespace-nowrap">
        <div>
          <N mono className="text-chalk font-semibold text-[15px]">{fmt(tot.protein, 1)}</N> {t('nutrition.g')}
        </div>
        <div>
          <N mono>{fmt(tot.kcal, 0)}</N> {t('nutrition.kcalUnit')}
        </div>
      </div>
    </button>
  )
}

function Summary({ totals, targets, isAdmin, onEdit }) {
  const { t } = useLanguage()
  const g = t('nutrition.g')
  const k = t('nutrition.kcalUnit')
  const p = totals.protein
  const pLeft = targets?.protein != null ? targets.protein - p : null
  const kLeft = targets?.kcal != null ? targets.kcal - totals.kcal : null
  return (
    <section className="bg-surface rounded-[22px] p-5 flex flex-col gap-[18px]" aria-label={t('nutrition.protein')}>
      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-2 min-w-0">
            <N mono className="text-[44px] leading-[48px] font-semibold tracking-[-0.03em]">{fmt(p, 0)}</N>
            <span className="text-chalkdim text-[15px] whitespace-nowrap">
              {targets?.protein != null ? (
                <>
                  {t('nutrition.of')} <N mono>{fmt(targets.protein, 1)}</N> {g} {t('nutrition.proteinWord')}
                </>
              ) : (
                <>
                  {g} {t('nutrition.proteinWord')}
                </>
              )}
            </span>
          </div>
          <span className="flex items-center gap-1 shrink-0">
            {pLeft != null && (
              <span className="text-chalkdim text-sm whitespace-nowrap">
                {pLeft > 0 ? (
                  <>
                    <N mono>{fmt(pLeft, 0)}</N> {g} {t('nutrition.left')}
                  </>
                ) : (
                  <span className="inline-flex items-center gap-1 text-chalk">
                    <Check size={16} aria-hidden="true" /> {t('nutrition.targetReached')}
                  </span>
                )}
              </span>
            )}
            {isAdmin && targets && (
              <button type="button" onClick={onEdit} aria-label={t('nutrition.editTargets')} title={t('nutrition.editTargets')} className="w-11 h-11 -my-3 -me-2 inline-flex items-center justify-center rounded-full text-chalkdim hover:text-chalk press">
                <Pencil size={15} />
              </button>
            )}
          </span>
        </div>
        {targets?.protein > 0 && <Track value={p} max={targets.protein} tone="protein" />}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex justify-between gap-3 text-sm">
          <span className="whitespace-nowrap">
            <N mono className="font-semibold">{fmt(totals.kcal, 0)}</N>{' '}
            <span className="text-chalkdim">
              {targets?.kcal != null ? (
                <>
                  {t('nutrition.of')} <N mono>{fmt(targets.kcal, 0)}</N> {k}
                </>
              ) : (
                k
              )}
            </span>
          </span>
          {kLeft != null && (
            <span className="text-chalkdim whitespace-nowrap">
              <N mono>{fmt(Math.abs(kLeft), 0)}</N> {kLeft >= 0 ? t('nutrition.left') : t('nutrition.overTarget')}
            </span>
          )}
        </div>
        {targets?.kcal > 0 && <Track value={totals.kcal} max={targets.kcal} tone="kcal" />}
      </div>

      <div className="grid grid-cols-2 gap-3 pt-3.5 border-t border-white/[0.07] text-sm">
        {[
          [t('nutrition.carbs'), totals.carbs, targets?.carbs],
          [t('nutrition.fat'), totals.fat, targets?.fat],
        ].map(([label, v, target]) => (
          <span key={label} className="text-chalkdim whitespace-nowrap">
            {label}{' '}
            <N mono className="text-chalk font-medium">{fmt(v, 0)}</N>
            {target != null && (
              <>
                {' / '}
                <N mono>{fmt(target, 1)}</N>
              </>
            )}{' '}
            {g}
          </span>
        ))}
      </div>
    </section>
  )
}
