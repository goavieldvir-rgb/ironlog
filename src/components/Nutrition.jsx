import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Bookmark, ChevronLeft, ChevronRight, Copy, Pencil, Plus, ScanBarcode } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { useAdmin } from '../context/AdminContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFeedback } from '../context/FeedbackContext.jsx'
import { fmtDate, toLocalISODate } from '../lib/dates.js'
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
  getTargets,
  insertLogs,
  isNotSetUp,
  saveMeal,
  saveTargets,
  sumLogs,
  updateLog,
} from '../lib/nutrition.js'
import { Button, Card, LoadError } from './ui.jsx'
import { AmountText, N, Name, Sheet, Track, UndoToast } from './nutrition/parts.jsx'
import AddFood from './nutrition/AddFood.jsx'
import FoodDetail from './nutrition/FoodDetail.jsx'
import LabelForm from './nutrition/LabelForm.jsx'
import Scanner from './nutrition/Scanner.jsx'
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

const shiftDay = (iso, n) => {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return toLocalISODate(d)
}

function Diary() {
  const { t, lang } = useLanguage()
  const { user } = useAuth()
  const { isAdmin, effectiveUid, actingAs } = useAdmin()
  const { confirm, toast } = useFeedback()
  const uid = effectiveUid
  const today = toLocalISODate()
  const [date, setDate] = useState(today)
  const [logs, setLogs] = useState([])
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

  // Load the day, the day before it (for "copy"), and the targets.
  useEffect(() => {
    if (!uid) return
    let off = false
    const key = `${uid}|${date}`
    if (loadedFor.current !== key) setLoading(true)
    Promise.all([getLogs(uid, date), getLogs(uid, shiftDay(date, -1)), getTargets(uid)])
      .then(([day, prev, tg]) => {
        if (off) return
        loadedFor.current = key
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
    } catch (err) {
      console.error(err)
      toast(friendlyError(err, t), 'error')
    }
    reload()
  }

  // Inserts rows into the diary and offers undo. Resolves true on success.
  async function addLogs(rows, message) {
    try {
      const inserted = await insertLogs(rows)
      showToast(message, inserted.map((r) => r.id))
      reload()
      return true
    } catch (err) {
      console.error(err)
      toast(friendlyError(err, t), 'error')
      return false
    }
  }

  // ----- sheet stack
  const push = (view) => setStack((s) => [...s, view])
  const pop = useCallback(() => setStack((s) => s.slice(0, -1)), [])
  const closeAll = useCallback(() => setStack([]), [])
  const openAdd = (m) => {
    if (m) setMeal(m)
    setStack([{ type: 'add' }])
  }
  const openScanner = (m) => {
    if (m) setMeal(m)
    setScanner(true)
  }

  async function logFood(food, option, qty, m) {
    const row = foodLogRow({ uid, date, meal: m, food, lang, option, qty })
    if (await addLogs([row], t('nutrition.added', { name: row.name }))) {
      setScanner(false)
      closeAll()
    }
  }

  async function onLabelSaved(food) {
    const options = buildUnitOptions(food, lang, t)
    const option = options.find((o) => o.kind === 'unit') || options.find((o) => o.kind === '100g')
    const row = foodLogRow({ uid, date, meal, food, lang, option, qty: 1 })
    if (await addLogs([row], t('nutrition.added', { name: row.name }))) closeAll()
  }

  async function copyPrevious() {
    const rows = cloneLogs(prevLogs, { uid, date })
    await addLogs(rows, t('nutrition.copied', { n: rows.length }))
  }

  async function onSaveTargets(values) {
    try {
      const saved = await saveTargets(uid, values)
      setTargets(saved)
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
  const prevTotals = sumLogs(prevLogs)
  const isToday = date === today
  const dateObj = new Date(date + 'T00:00:00')
  const dayLabel = isToday ? t('nutrition.today') : date === shiftDay(today, -1) ? t('nutrition.yesterday') : fmtDate(lang, dateObj, { weekday: 'long' })
  const dateLine = fmtDate(lang, dateObj, { weekday: 'short', day: 'numeric', month: 'long' })
  const g = t('nutrition.g')
  const k = t('nutrition.kcalUnit')
  const notSetUp = loadError && isNotSetUp(loadError)

  const topView = stack[stack.length - 1]
  const targetsKnown = !loading && !loadError

  return (
    <div className="flex flex-col gap-5 max-w-xl mx-auto w-full pb-6">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="eyebrow mb-1">{actingAs ? <bdi>{actingAs.name || actingAs.email}</bdi> : t('nutrition.title')}</div>
          <h1 className="text-3xl truncate">{dayLabel}</h1>
          <p className="text-chalkdim text-sm mt-1 font-body"><bdi>{dateLine}</bdi></p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!isToday && (
            <button type="button" onClick={() => setDate(today)} className="min-h-[44px] px-3 rounded-md text-sm text-chalk border border-line hover:bg-surface2">
              {t('nutrition.today')}
            </button>
          )}
          <button type="button" onClick={() => setDate(shiftDay(date, -1))} aria-label={t('nutrition.prevDay')} className="w-11 h-11 inline-flex items-center justify-center rounded-md hover:bg-surface2 press">
            <span className="rtl:hidden"><ChevronLeft size={22} /></span>
            <span className="ltr:hidden"><ChevronRight size={22} /></span>
          </button>
          <button type="button" disabled={isToday} onClick={() => setDate(shiftDay(date, 1))} aria-label={t('nutrition.nextDay')} className="w-11 h-11 inline-flex items-center justify-center rounded-md hover:bg-surface2 press disabled:opacity-30 disabled:pointer-events-none">
            <span className="rtl:hidden"><ChevronRight size={22} /></span>
            <span className="ltr:hidden"><ChevronLeft size={22} /></span>
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

          <div className="flex gap-2">
            <Button variant="brass" className="flex-1 min-h-[56px] text-base" onClick={() => openAdd(defaultMeal())}>
              <Plus size={20} /> {t('nutrition.addFood')}
            </Button>
            <Button variant="subtle" className="min-h-[56px] px-5 text-base" onClick={() => openScanner(defaultMeal())}>
              <ScanBarcode size={20} /> {t('nutrition.scan')}
            </Button>
          </div>

          {prevLogs.length > 0 && (
            <Card className="flex items-center justify-between gap-3 !py-3">
              <div className="min-w-0">
                <div className="eyebrow">{date === today ? t('nutrition.yesterday') : t('nutrition.previousDayLabel')}</div>
                <p className="text-sm mt-0.5 whitespace-nowrap">
                  <N mono>{fmt(prevTotals.protein, 1)}</N> {g} {t('nutrition.proteinWord')}
                </p>
                <p className="text-chalkdim text-xs whitespace-nowrap">
                  <N mono>{fmt(prevTotals.kcal, 0)}</N> {k}
                </p>
              </div>
              <Button variant="ghost" className="shrink-0 whitespace-nowrap" onClick={copyPrevious}>
                <Copy size={16} /> {date === today ? t('nutrition.copyYesterday') : t('nutrition.copyPrevious')}
              </Button>
            </Card>
          )}

          <Water uid={uid} date={date} today={today} onPickDate={setDate} onToast={showToast} />

          {MEALS.map((m) => {
            const rows = logs.filter((r) => r.meal === m)
            const mk = sumLogs(rows).kcal
            return (
              <section key={m} aria-labelledby={`meal-${m}`}>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <h2 id={`meal-${m}`} className="text-xl flex items-baseline gap-2.5 min-w-0">
                    <span className="truncate">{t(MEAL_KEY[m])}</span>
                    {mk > 0 && (
                      <span className="text-chalkdim text-sm whitespace-nowrap">
                        <N mono>{fmt(mk, 0)}</N> {k}
                      </span>
                    )}
                  </h2>
                  <div className="flex items-center gap-1 shrink-0">
                    {rows.length > 0 && (
                      <button type="button" onClick={() => push({ type: 'saveMeal', meal: m })} aria-label={`${t('nutrition.saveAsMeal')}: ${t(MEAL_KEY[m])}`} title={t('nutrition.saveAsMeal')} className="w-11 h-11 inline-flex items-center justify-center rounded-md text-chalkdim hover:text-chalk hover:bg-surface2">
                        <Bookmark size={19} />
                      </button>
                    )}
                    <button type="button" onClick={() => openAdd(m)} aria-label={t('nutrition.addToMealLabel', { meal: t(MEAL_KEY[m]) })} className="w-11 h-11 inline-flex items-center justify-center rounded-md border border-line bg-surface2 hover:border-chalk press">
                      <Plus size={20} />
                    </button>
                  </div>
                </div>
                {rows.length === 0 ? (
                  <p className="text-chalkdim text-sm px-1 pb-1">{t('nutrition.nothingLogged')}</p>
                ) : (
                  <ul className="card divide-y divide-line overflow-hidden">
                    {rows.map((r) => (
                      <li key={r.id}>
                        <button type="button" onClick={() => push({ type: 'edit', row: r })} className="w-full flex items-center justify-between gap-3 px-4 py-3 min-h-[60px] text-start hover:bg-surface2 press-row">
                          <div className="min-w-0 flex-1">
                            <Name className="font-medium">{r.name}</Name>
                            {r.grams != null && (
                              <span className="block text-chalkdim text-xs whitespace-nowrap truncate mt-0.5">
                                <AmountText row={r} />
                              </span>
                            )}
                          </div>
                          <div className="text-end shrink-0">
                            <div className="whitespace-nowrap">
                              <N mono className="text-base">{fmt(r.protein, 1)}</N> <span className="text-chalkdim text-xs">{g} {t('nutrition.proteinWord')}</span>
                            </div>
                            <div className="text-chalkdim text-xs whitespace-nowrap mt-0.5">
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
        <Sheet onClose={closeAll} label={t('nutrition.title')}>
          {stack.map((v, i) => {
            const isTop = i === stack.length - 1
            const common = { onClose: closeAll, onBack: i > 0 ? pop : undefined }
            let body = null
            switch (v.type) {
              case 'add':
                body = (
                  <AddFood
                    meal={meal}
                    setMeal={setMeal}
                    uid={uid}
                    date={date}
                    onClose={closeAll}
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
              case 'meals':
                body = <MyMealsView {...common} uid={uid} date={date} meal={meal} setMeal={setMeal} onLog={addLogs} />
                break
              default:
                break
            }
            return (
              <div key={i} className={`${isTop ? 'flex' : 'hidden'} flex-col flex-1 min-h-0`}>
                {body}
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

function Summary({ totals, targets, isAdmin, onEdit }) {
  const { t } = useLanguage()
  const g = t('nutrition.g')
  const k = t('nutrition.kcalUnit')
  const p = totals.protein
  const pLeft = targets?.protein != null ? targets.protein - p : null
  const kLeft = targets?.kcal != null ? targets.kcal - totals.kcal : null
  return (
    <Card className="flex flex-col gap-4">
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="eyebrow">{t('nutrition.protein')}</span>
          <span className="flex items-center gap-1">
            {pLeft != null && (
              <span className="text-chalkdim text-sm whitespace-nowrap">
                {pLeft > 0 ? (
                  <>
                    <N mono className="text-chalk">{fmt(pLeft, 0)}</N> {g} {t('nutrition.left')}
                  </>
                ) : (
                  t('nutrition.targetReached')
                )}
              </span>
            )}
            {isAdmin && targets && (
              <button type="button" onClick={onEdit} aria-label={t('nutrition.editTargets')} className="w-11 h-11 -my-2 -me-2 inline-flex items-center justify-center rounded-md text-chalkdim hover:text-chalk hover:bg-surface2">
                <Pencil size={16} />
              </button>
            )}
          </span>
        </div>
        <div className="flex items-baseline gap-2 mt-1">
          <N mono className="text-3xl leading-none">{fmt(p, 0)}</N>
          {targets?.protein != null && (
            <span className="text-chalkdim text-sm whitespace-nowrap">
              {t('nutrition.of')} <N mono>{fmt(targets.protein, 0)}</N> {g}
            </span>
          )}
          {targets?.protein == null && <span className="text-chalkdim text-sm">{g}</span>}
        </div>
        {targets?.protein > 0 && (
          <div className="mt-3">
            <Track value={p} max={targets.protein} />
          </div>
        )}
      </div>

      <div className="border-t border-line pt-4">
        <div className="flex items-center justify-between gap-2">
          <span className="eyebrow">{t('nutrition.calories')}</span>
          {kLeft != null && (
            <span className="text-chalkdim text-sm whitespace-nowrap">
              <N mono className="text-chalk">{fmt(Math.abs(kLeft), 0)}</N> {kLeft >= 0 ? t('nutrition.left') : t('nutrition.overTarget')}
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-2 mt-1">
          <N mono className="text-xl leading-none">{fmt(totals.kcal, 0)}</N>
          <span className="text-chalkdim text-sm whitespace-nowrap">
            {targets?.kcal != null ? (
              <>
                {t('nutrition.of')} <N mono>{fmt(targets.kcal, 0)}</N> {k}
              </>
            ) : (
              k
            )}
          </span>
        </div>
        {targets?.kcal > 0 && (
          <div className="mt-2.5">
            <Track value={totals.kcal} max={targets.kcal} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 border-t border-line pt-4">
        {[
          [t('nutrition.carbs'), totals.carbs, targets?.carbs],
          [t('nutrition.fat'), totals.fat, targets?.fat],
        ].map(([label, v, target]) => (
          <div key={label}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="eyebrow">{label}</span>
              <span className="text-chalkdim text-sm whitespace-nowrap">
                <N mono className="text-chalk">{fmt(v, 0)}</N>
                {target != null && (
                  <>
                    {' / '}
                    <N mono>{fmt(target, 0)}</N>
                  </>
                )}{' '}
                {g}
              </span>
            </div>
            {target > 0 && (
              <div className="mt-2">
                <Track value={v} max={target} size="sm" />
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}
