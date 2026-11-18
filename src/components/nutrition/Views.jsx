import React, { useEffect, useState } from 'react'
import { Check, CopyPlus, Library, Pencil, Plus, Repeat, Trash2, X } from 'lucide-react'
import { useLanguage } from '../../context/LanguageContext.jsx'
import { useFeedback } from '../../context/FeedbackContext.jsx'
import { Button } from '../ui.jsx'
import {
  cloneLogs,
  deleteSavedMeal,
  fmt,
  friendlyError,
  getSavedMeals,
  isCoachMeal,
  removeSwap,
  MEALS_EVENT,
  parseNum,
  round1,
  scaleItems,
  sumLogs,
  logName,
  logUnit,
  unitLabel,
  updateSavedMeal,
  ALL_MEALS,
  DEFAULT_MEALS,
  MEAL_KEY,
} from '../../lib/nutrition.js'
import { MACROS, macroGrams, setMacroPct, splitFromTargets, splitTotal } from '../../lib/macroSplit.js'
import { AmountControl, AmountText, MacroInputs, MacroPanel, MealTabs, N, Name, SheetHeader, UnitChips, mealLabel, useDirtyForm } from './parts.jsx'

const round2 = (n) => Math.round(n * 100) / 100
const FACTORS = [0.5, 1, 1.5, 2]

// ------------------------------------------------------------ edit a log row

export function EditLog({ row, maxDate, onBack, onClose, onSave, onCopy, onDelete }) {
  const { t, lang } = useLanguage()
  const g = t('nutrition.g')
  const hasGrams = row.grams != null
  // Units this row can be edited in: its own household unit, the food's
  // other units, and grams.
  const unitG = row.unit_label && row.unit_qty ? Number(row.grams) / Number(row.unit_qty) : null
  const own = unitG ? logUnit(row, lang) : null
  const foodUnits = (Array.isArray(row.food?.units) ? row.food.units : [])
    .filter((u) => Number(u?.g) > 0)
    .map((u, i) => ({ key: `f${i}`, label: unitLabel(u, lang), g: Number(u.g), step: 0.5 }))
    .filter((o) => o.label !== own)
  const options = [
    ...(unitG ? [{ key: 'u', label: own, g: unitG, step: 0.5 }] : []),
    ...(hasGrams ? foodUnits : []),
    { key: 'g', label: g, g: 1, step: 10 },
  ]
  // Start in the unit the entry was logged in: its own unit, else grams.
  const [oi, setOi] = useState(() => (unitG ? 0 : options.findIndex((o) => o.key === 'g')))
  const [qty, setQty] = useState(() => String(unitG ? row.unit_qty : round1(row.grams)))
  const [meal, setMeal] = useState(row.meal)
  const [day, setDay] = useState(row.date)
  const [vals, setVals] = useState({
    name: row.name,
    protein: String(row.protein),
    kcal: String(row.kcal),
    carbs: String(row.carbs),
    fat: String(row.fat),
  })
  const [busy, setBusy] = useState(false)
  const [start] = useState(() => JSON.stringify({ qty, meal, day, vals }))
  useDirtyForm(JSON.stringify({ qty, meal, day, vals }) !== start)
  const opt = options[oi]
  const q = parseNum(qty)
  const newGrams = hasGrams && q > 0 ? round1(q * opt.g) : 0
  const factor = hasGrams ? newGrams / Number(row.grams) : 1
  const scaled = (k) => round1(Number(row[k]) * factor)

  function pickUnit(i) {
    // keep the same amount, expressed in the other unit
    const cur = Number.isFinite(q) ? q * opt.g : Number(row.grams)
    setOi(i)
    setQty(String(round2(cur / options[i].g)))
  }
  const num = (v) => (Number.isFinite(parseNum(v)) ? Math.max(0, parseNum(v)) : 0)
  const valid = hasGrams ? newGrams > 0 : vals.kcal !== '' && Number.isFinite(parseNum(vals.kcal))

  // The entry as edited. A food unit other than the logged one becomes the
  // entry's unit.
  function buildPatch() {
    if (!hasGrams)
      return {
        meal,
        date: day,
        name: vals.name.trim() || row.name,
        kcal: round1(num(vals.kcal)),
        protein: round1(num(vals.protein)),
        carbs: round1(num(vals.carbs)),
        fat: round1(num(vals.fat)),
      }
    const food = opt.key.startsWith('f')
    return {
      meal,
      date: day,
      grams: newGrams,
      unit_label: food ? opt.label : row.unit_label,
      unit_qty: food || opt.key === 'u' ? q : unitG ? round2(newGrams / unitG) : row.unit_qty,
      kcal: scaled('kcal'),
      protein: scaled('protein'),
      carbs: scaled('carbs'),
      fat: scaled('fat'),
      ...(row.fiber != null ? { fiber: scaled('fiber') } : {}),
    }
  }

  async function save() {
    if (!valid || busy) return
    setBusy(true)
    try {
      await onSave(row.id, buildPatch())
    } finally {
      setBusy(false)
    }
  }

  // A copy on the chosen day and meal; the entry itself stays as it was.
  async function copy() {
    if (!valid || busy) return
    setBusy(true)
    try {
      await onCopy(row, buildPatch())
    } finally {
      setBusy(false)
    }
  }

  const shown = hasGrams
    ? { protein: scaled('protein'), kcal: scaled('kcal'), carbs: scaled('carbs'), fat: scaled('fat') }
    : null

  return (
    <>
      <SheetHeader title={t('nutrition.editItem')} onBack={onBack} onClose={onClose} />
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 flex flex-col gap-5">
        <h3 className="text-2xl leading-tight line-clamp-2 break-words">
          <bdi>{logName(row, lang)}</bdi>
        </h3>
        <MealTabs value={meal} onChange={setMeal} />
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm text-chalkdim">{t('nutrition.day')}</span>
          <input type="date" value={day} max={maxDate} onChange={(e) => e.target.value && setDay(e.target.value)} className="!min-h-[44px] w-auto" />
        </label>
        {hasGrams ? (
          <>
            <div className="flex flex-col gap-4 py-1">
              <AmountControl
                value={qty}
                unit={opt.label}
                grams={opt.key === 'u' ? newGrams : 0}
                onChange={setQty}
                onStep={(d) => setQty(String(Math.max(0, round2((Number.isFinite(q) ? q : 0) + d * opt.step))))}
              />
              {options.length > 1 && <UnitChips options={options} value={oi} onChange={pickUnit} />}
            </div>
            <MacroPanel macros={shown} />
          </>
        ) : (
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-chalkdim">{t('nutrition.productName')}</span>
              <input dir="auto" value={vals.name} onChange={(e) => setVals((s) => ({ ...s, name: e.target.value }))} />
            </label>
            <MacroInputs values={vals} onChange={(k, v) => setVals((s) => ({ ...s, [k]: v }))} />
          </div>
        )}
      </div>
      <div className="p-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] shrink-0 flex gap-2">
        <Button variant="danger" onClick={() => onDelete(row)} aria-label={t('nutrition.delete')} className="min-h-[52px] px-4">
          <Trash2 size={18} />
        </Button>
        <Button variant="ghost" onClick={copy} disabled={!valid || busy} className="min-h-[52px] px-4" aria-label={t('nutrition.copyEntry')}>
          <CopyPlus size={18} /> {t('nutrition.copyShort')}
        </Button>
        <Button variant="brass" onClick={save} disabled={!valid || busy} className="flex-1 min-h-[52px] text-base">
          <Check size={20} /> {t('nutrition.save')}
        </Button>
      </div>
    </>
  )
}

// ------------------------------------------------------------ daily targets

// The meal slots as the editor holds them: every slot, on or off, with the
// coach's names.
function mealRows(meals) {
  const list = Array.isArray(meals) && meals.length ? meals : DEFAULT_MEALS.map((key) => ({ key }))
  return ALL_MEALS.map((key) => {
    const m = list.find((x) => x.key === key)
    return { key, on: !!m, en: m?.en || '', he: m?.he || '' }
  })
}
function mealsValue(rows) {
  const on = rows.filter((r) => r.on)
  const plain = on.length === DEFAULT_MEALS.length && on.every((r, i) => r.key === DEFAULT_MEALS[i] && !r.en.trim() && !r.he.trim())
  return plain ? null : on.map((r) => ({ key: r.key, ...(r.en.trim() ? { en: r.en.trim() } : {}), ...(r.he.trim() ? { he: r.he.trim() } : {}) }))
}

export function TargetsView({ targets, note, coach = false, onBack, onClose, onSave }) {
  const { t } = useLanguage()
  const g = t('nutrition.g')
  const [kcalText, setKcalText] = useState(targets?.kcal != null ? String(targets.kcal) : '')
  const [split, setSplit] = useState(() => splitFromTargets(targets))
  const [fiberText, setFiberText] = useState(targets?.fiber != null ? String(targets.fiber) : '')
  const [band, setBand] = useState(targets?.kcal_band ?? 10)
  const [meals, setMeals] = useState(() => mealRows(targets?.meals))
  // The split before the current slider started moving; the other two keep
  // its ratio. Replaced whenever a different slider is touched.
  const [anchor, setAnchor] = useState({ key: null, split })
  const [start] = useState({ kcalText, split, fiberText, band, meals: JSON.stringify(meals) })
  useDirtyForm(
    kcalText !== start.kcalText || MACROS.some((k) => split[k] !== start.split[k]) ||
      fiberText !== start.fiberText || band !== start.band || JSON.stringify(meals) !== start.meals,
  )
  const setMeal = (key, patch) => setMeals((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const mealsOn = meals.filter((r) => r.on).length
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const kcal = parseNum(kcalText) > 0 ? Math.round(parseNum(kcalText)) : null
  const total = splitTotal(split)
  function move(key, value) {
    const base = anchor.key === key ? anchor.split : split
    if (anchor.key !== key) setAnchor({ key, split })
    setSplit(setMacroPct(base, key, value))
  }
  async function submit(e) {
    e.preventDefault()
    if (!kcal) return setError(t('nutrition.targetInvalid'))
    if (total !== 100) return setError(t('nutrition.splitMustTotal', { n: total }))
    setError('')
    setBusy(true)
    try {
      // Grams to one decimal (fat at 2,500 kcal / 20% is 55.6 g). 0 g is
      // stored as "no target", as before.
      const grams = (k) => round1(macroGrams(kcal, split[k], k)) || null
      const fiber = parseNum(fiberText) > 0 ? Math.min(199, round1(parseNum(fiberText))) : null
      const extras = {}
      // Only sent once changed, so an app ahead of the database still saves.
      if (fiberText !== start.fiberText) extras.fiber = fiber
      if (band !== start.band) extras.kcal_band = band
      if (coach && JSON.stringify(meals) !== start.meals) extras.meals = mealsValue(meals)
      await onSave({ kcal, protein: grams('protein'), carbs: grams('carbs'), fat: grams('fat'), ...extras })
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <SheetHeader title={t('nutrition.targetsTitle')} onBack={onBack} onClose={onClose} />
      <form onSubmit={submit} className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-5">
          {note && <p className="text-chalkdim text-sm mt-2">{note}</p>}
          <label className="flex flex-col gap-1.5 mt-2">
            <span className="eyebrow">{t('nutrition.targetKcal')}</span>
            <input
              inputMode="numeric"
              dir="ltr"
              className="num text-center !text-lg"
              value={kcalText}
              onChange={(e) => setKcalText(e.target.value.replace(/[^\d]/g, ''))}
            />
          </label>
          <div className="flex flex-col gap-4">
            <div className="flex items-baseline justify-between">
              <span className="eyebrow">{t('nutrition.macroSplit')}</span>
              <span className={`text-sm num ${total === 100 ? 'text-chalkdim' : 'text-irontext'}`} dir="ltr">
                {t('nutrition.splitTotal', { n: total })}
              </span>
            </div>
            {MACROS.map((k) => {
              const grams = macroGrams(kcal, split[k], k)
              return (
                <label key={k} className="flex flex-col gap-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="text-chalk">{t(`nutrition.${k}`)}</span>
                    <span className="num" dir="ltr">
                      <span className="text-chalk text-lg">{split[k]}%</span>
                      <span className="text-chalkdim text-sm ms-2">
                        {grams == null ? '—' : fmt(grams, 1)} {g}
                      </span>
                    </span>
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={split[k]}
                    onChange={(e) => move(k, e.target.value)}
                    aria-valuetext={`${split[k]}%`}
                    className="w-full !bg-transparent !px-0 !border-0 accent-accent"
                  />
                </label>
              )
            })}
            <p className="text-chalkdim text-xs">{t('nutrition.splitHint')}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="eyebrow">{t('nutrition.fiberTarget')}</span>
              <input
                inputMode="decimal"
                dir="ltr"
                className="num text-center"
                placeholder="—"
                value={fiberText}
                onChange={(e) => setFiberText(e.target.value.replace(/[^\d.]/g, ''))}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="eyebrow">{t('nutrition.kcalBand')}</span>
              <select value={band} onChange={(e) => setBand(Number(e.target.value))}>
                {[5, 10, 15, 20, 25].map((n) => (
                  <option key={n} value={n}>
                    ±{n}%
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-chalkdim text-xs -mt-3">{t('nutrition.kcalBandHint')}</p>
          {coach && (
            <div className="flex flex-col gap-2">
              <span className="eyebrow">{t('nutrition.mealSlots')}</span>
              <p className="text-chalkdim text-xs">{t('nutrition.mealSlotsHint')}</p>
              {meals.map((r) => (
                <div key={r.key} className="flex items-center gap-2">
                  <span className="w-20 shrink-0 text-sm text-chalkdim truncate">{t(MEAL_KEY[r.key])}</span>
                  <input
                    type="checkbox"
                    checked={r.on}
                    disabled={r.on && mealsOn === 1}
                    onChange={() => setMeal(r.key, { on: !r.on })}
                    aria-label={t(MEAL_KEY[r.key])}
                    className="w-5 h-5 shrink-0"
                  />
                  <input
                    value={r.en}
                    onChange={(e) => setMeal(r.key, { en: e.target.value })}
                    placeholder={t('nutrition.mealNameEn')}
                    maxLength={30}
                    dir="ltr"
                    disabled={!r.on}
                    className="flex-1 min-w-0 !text-sm"
                    aria-label={t('nutrition.mealNameEn')}
                  />
                  <input
                    value={r.he}
                    onChange={(e) => setMeal(r.key, { he: e.target.value })}
                    placeholder={t('nutrition.mealNameHe')}
                    maxLength={30}
                    dir="rtl"
                    disabled={!r.on}
                    className="flex-1 min-w-0 !text-sm"
                    aria-label={t('nutrition.mealNameHe')}
                  />
                </div>
              ))}
            </div>
          )}
          {error && (
            <p className="text-sm text-irontext" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="p-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] shrink-0">
          <Button type="submit" variant="brass" className="w-full min-h-[52px] text-base" disabled={busy || total !== 100}>
            <Check size={20} /> {t('nutrition.save')}
          </Button>
        </div>
      </form>
    </>
  )
}

// ------------------------------------------------------------ save a meal

// coachSlot: the coach is saving for a trainee, so it can be saved as a coach
// option for that meal slot (on by default).
export function SaveMealView({ defaultName, count, coachSlot = '', onBack, onClose, onSave }) {
  const { t } = useLanguage()
  const [name, setName] = useState(defaultName)
  const [asCoach, setAsCoach] = useState(!!coachSlot)
  // The coach logged these foods only to build the option: clear them after.
  const [clear, setClear] = useState(true)
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      await onSave(name.trim(), !!coachSlot && asCoach, !!coachSlot && asCoach && clear)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <SheetHeader title={t('nutrition.saveAsMeal')} onBack={onBack} onClose={onClose} />
      <form onSubmit={submit} className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 px-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 mt-2">
            <span className="eyebrow">{t('nutrition.mealNameLabel')}</span>
            <input dir="auto" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          <p className="text-chalkdim text-sm">{count === 1 ? t('nutrition.itemsOne') : t('nutrition.itemsMany', { n: count })}</p>
          {coachSlot && (
            <label className="card flex items-start gap-3 p-4 cursor-pointer">
              <input type="checkbox" className="mt-1 shrink-0" checked={asCoach} onChange={(e) => setAsCoach(e.target.checked)} />
              <span className="min-w-0">
                <span className="block text-[15px] font-medium">{t('nutrition.asCoachOption', { meal: coachSlot })}</span>
                <span className="block text-chalkdim text-sm mt-0.5">{t('nutrition.asCoachOptionHint')}</span>
              </span>
            </label>
          )}
          {coachSlot && asCoach && (
            <label className="flex items-start gap-3 px-4 cursor-pointer">
              <input type="checkbox" className="mt-1 shrink-0" checked={clear} onChange={(e) => setClear(e.target.checked)} />
              <span className="text-sm text-chalkdim">{t('nutrition.clearAfterSave')}</span>
            </label>
          )}
        </div>
        <div className="p-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] shrink-0">
          <Button type="submit" variant="brass" className="w-full min-h-[52px] text-base" disabled={!name.trim() || busy}>
            <Check size={20} /> {t('nutrition.save')}
          </Button>
        </div>
      </form>
    </>
  )
}

// ------------------------------------------------------------ my meals

// coach: the coach is looking at a trainee's meals, so coach options can be
// edited, given swaps (onAddSwap) and copied from other trainees (onLibrary).
// A trainee can log a coach option but not change it.
export function MyMealsView({ uid, date, meal, setMeal, onBack, onClose, onLog, coach = false, onAddSwap, onLibrary }) {
  const { t } = useLanguage()
  const { confirm, toast } = useFeedback()
  const [meals, setMeals] = useState(null)
  const [error, setError] = useState('')
  const [factors, setFactors] = useState({}) // meal id -> portion factor
  const [renaming, setRenaming] = useState(null) // { id, name }
  const [busy, setBusy] = useState(false)
  const g = t('nutrition.g')

  useEffect(() => {
    const load = () =>
      getSavedMeals(uid)
        // Coach options first: they're the plan.
        .then((list) => setMeals([...list.filter(isCoachMeal), ...list.filter((m) => !isCoachMeal(m))]))
        .catch((err) => {
          console.error(err)
          setMeals((m) => m || [])
          setError(friendlyError(err, t, 'nutrition.loadFailed'))
        })
    load()
    // A swap added from the add sheet, or a meal copied from the library.
    window.addEventListener(MEALS_EVENT, load)
    return () => window.removeEventListener(MEALS_EVENT, load)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid])

  async function remove(m) {
    if (!(await confirm({ title: t('nutrition.deleteMealTitle'), body: t('nutrition.deleteMealBody'), confirmLabel: t('nutrition.delete'), danger: true }))) return
    try {
      await deleteSavedMeal(m.id)
      setMeals((list) => list.filter((x) => x.id !== m.id))
    } catch (err) {
      console.error(err)
      toast(friendlyError(err, t), 'error')
    }
  }

  // Save a patch, then update local state.
  async function patchMeal(m, patch) {
    if (busy) return false
    setBusy(true)
    try {
      const row = await updateSavedMeal(m.id, patch)
      setMeals((list) => list.map((x) => (x.id === m.id ? { ...x, ...row } : x)))
      return true
    } catch (err) {
      console.error(err)
      toast(friendlyError(err, t), 'error')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function rename(m) {
    const name = renaming.name.trim()
    if (!name) return
    if (name === m.name || (await patchMeal(m, { name }))) setRenaming(null)
  }

  const removeItem = (m, items, i) => patchMeal(m, { items: items.filter((_, j) => j !== i) })

  return (
    <>
      <SheetHeader title={t('nutrition.myMealsTitle')} onBack={onBack} onClose={onClose} />
      <div className="px-4 pt-2 shrink-0">
        <MealTabs value={meal} onChange={setMeal} />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] pt-3 flex flex-col gap-3">
        {coach && (
          <div className="card p-4 flex flex-col gap-3">
            <p className="text-chalkdim text-sm">{t('nutrition.coachOptionsHint')}</p>
            {onLibrary && (
              <Button variant="subtle" className="min-h-[48px]" onClick={onLibrary}>
                <Library size={18} /> {t('nutrition.coachLibraryOpen')}
              </Button>
            )}
          </div>
        )}
        {error && <p className="text-sm" role="alert">{error}</p>}
        {meals && meals.length === 0 && !error && <p className="text-chalkdim text-sm">{t('nutrition.noSavedMeals')}</p>}
        {(meals || []).map((m) => {
          const items = Array.isArray(m.items) ? m.items : []
          const byCoach = isCoachMeal(m)
          // A trainee can use a coach option but only the coach changes it.
          const canEdit = !byCoach || coach
          const factor = factors[m.id] ?? 1
          const scaled = scaleItems(items, factor)
          const tot = sumLogs(scaled)
          const editing = renaming?.id === m.id
          return (
            <section key={m.id} className="card overflow-hidden shrink-0">
              <div className="p-4 pb-2">
                {editing ? (
                  <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); rename(m) }}>
                    <input
                      dir="auto"
                      className="flex-1 min-w-0"
                      aria-label={t('nutrition.mealNameLabel')}
                      value={renaming.name}
                      onChange={(e) => setRenaming({ id: m.id, name: e.target.value })}
                      autoFocus
                    />
                    <Button type="submit" variant="brass" className="px-3.5" disabled={!renaming.name.trim() || busy} aria-label={t('nutrition.save')}>
                      <Check size={18} />
                    </Button>
                    <Button type="button" variant="ghost" className="px-3.5" onClick={() => setRenaming(null)} aria-label={t('nutrition.cancel')}>
                      <X size={18} />
                    </Button>
                  </form>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      {byCoach && (
                        <div className="eyebrow mb-0.5">
                          {t('nutrition.fromCoach')}
                          {m.meal ? ` · ${mealLabel(t, m.meal)}` : ''}
                        </div>
                      )}
                      <h3 className="text-xl leading-tight min-w-0"><bdi>{m.name}</bdi></h3>
                    </div>
                    {canEdit && <button
                      type="button"
                      onClick={() => setRenaming({ id: m.id, name: m.name })}
                      className="min-h-[44px] min-w-[44px] -me-2 flex items-center justify-center text-chalkdim hover:text-chalk press shrink-0"
                      aria-label={t('nutrition.renameMeal')}
                    >
                      <Pencil size={16} />
                    </button>}
                  </div>
                )}
                <p className="text-chalkdim text-xs mt-0.5">{items.length === 1 ? t('nutrition.itemsOne') : t('nutrition.itemsMany', { n: items.length })}</p>
              </div>
              <ul className="divide-y divide-white/[0.06]">
                {scaled.map((it, i) => (
                  <li key={i} className="flex flex-col ps-4 pe-1 py-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <Name className="text-sm">{it.name}</Name>
                      {it.grams != null && <p className="text-chalkdim text-xs"><AmountText row={it} /></p>}
                    </div>
                    <div className="text-end shrink-0">
                      <div className="text-sm"><N mono>{fmt(it.protein, 1)}</N> <span className="text-chalkdim text-xs">{g}</span></div>
                      <div className="text-chalkdim text-xs"><N mono>{fmt(it.kcal, 0)}</N> {t('nutrition.kcalUnit')}</div>
                    </div>
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => removeItem(m, items, i)}
                        disabled={busy}
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center text-chalkdim hover:text-chalk press shrink-0 disabled:opacity-40"
                        aria-label={t('nutrition.removeItem', { name: it.name })}
                      >
                        <X size={16} />
                      </button>
                    ) : (
                      <span className="w-3 shrink-0" aria-hidden="true" />
                    )}
                  </div>
                  {/* Swaps the coach gave for this food (not scaled: the
                      trainee sees them at the planned amount). */}
                  {byCoach && (items[i].alts?.length > 0 || coach) && (
                    <ul className="flex flex-col pb-1">
                      {(items[i].alts || []).map((alt, k) => (
                        <li key={k} className="flex items-center gap-2 text-chalkdim text-xs min-h-[36px]">
                          <Repeat size={13} className="shrink-0" aria-hidden="true" />
                          <span dir="auto" className="flex-1 min-w-0 truncate text-start">
                            {alt.name}
                            {alt.grams != null && <> · <AmountText row={alt} /></>}
                          </span>
                          {coach && (
                            <button
                              type="button"
                              onClick={() => patchMeal(m, { items: removeSwap(items, i, k) })}
                              disabled={busy}
                              className="min-h-[36px] min-w-[44px] flex items-center justify-center hover:text-chalk press shrink-0 disabled:opacity-40"
                              aria-label={t('nutrition.removeSwap', { name: alt.name })}
                            >
                              <X size={14} />
                            </button>
                          )}
                        </li>
                      ))}
                      {coach && onAddSwap && (
                        <li>
                          <button
                            type="button"
                            onClick={() => onAddSwap(m, i)}
                            className="min-h-[36px] inline-flex items-center gap-1.5 text-xs text-chalkdim hover:text-chalk press"
                          >
                            <Plus size={13} aria-hidden="true" /> {t('nutrition.addSwap')}
                          </button>
                        </li>
                      )}
                    </ul>
                  )}
                  </li>
                ))}
              </ul>
              <dl className="grid grid-cols-4 bg-surface2 divide-x divide-white/[0.06] rtl:divide-x-reverse text-center">
                {[
                  [t('nutrition.protein'), tot.protein],
                  [t('nutrition.calories'), tot.kcal, 0],
                  [t('nutrition.carbs'), tot.carbs],
                  [t('nutrition.fat'), tot.fat],
                ].map(([label, v, d = 1]) => (
                  <div key={label} className="py-2.5 min-w-0 px-1">
                    <dd className="text-lg"><N mono>{fmt(v, d)}</N></dd>
                    <dt className="text-chalkdim text-[11px] truncate">{label}</dt>
                  </div>
                ))}
              </dl>
              <div role="radiogroup" aria-label={t('nutrition.portion')} className="px-3 pt-3 flex gap-2 justify-center">
                {FACTORS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    role="radio"
                    aria-checked={f === factor}
                    onClick={() => setFactors((s) => ({ ...s, [m.id]: f }))}
                    className={`min-h-[44px] px-3.5 rounded-full text-sm press ${f === factor ? 'bg-chalk text-ink font-medium' : 'bg-surface2 text-chalkdim hover:text-chalk'}`}
                  >
                    <N mono>×{f}</N>
                  </button>
                ))}
              </div>
              <div className="p-3 flex gap-2">
                <Button variant="ghost" className="flex-1 min-h-[48px]" disabled={!items.length} onClick={() => onLog(cloneLogs(scaled.map((it) => ({ ...it, saved_meal_id: m.id })), { uid, date, meal }), t('nutrition.loggedToMeal', { meal: mealLabel(t, meal) }))}>
                  <Plus size={18} /> {t('nutrition.logToMeal', { meal: mealLabel(t, meal) })}
                </Button>
                {canEdit && (
                  <Button variant="danger" className="px-3.5 min-h-[48px]" onClick={() => remove(m)} aria-label={t('nutrition.delete')}>
                    <Trash2 size={18} />
                  </Button>
                )}
              </div>
            </section>
          )
        })}
      </div>
    </>
  )
}
