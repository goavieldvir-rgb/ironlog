import React, { useEffect, useState } from 'react'
import { Check, Plus, Trash2 } from 'lucide-react'
import { useLanguage } from '../../context/LanguageContext.jsx'
import { useFeedback } from '../../context/FeedbackContext.jsx'
import { Button } from '../ui.jsx'
import {
  cloneLogs,
  deleteSavedMeal,
  fmt,
  friendlyError,
  getSavedMeals,
  parseNum,
  round1,
  sumLogs,
  logName,
  logUnit,
} from '../../lib/nutrition.js'
import { MACROS, macroGrams, setMacroPct, splitFromTargets, splitTotal } from '../../lib/macroSplit.js'
import { AmountControl, AmountText, MacroInputs, MacroPanel, MealTabs, N, Name, SheetHeader, UnitChips, mealLabel, useDirtyForm } from './parts.jsx'

const round2 = (n) => Math.round(n * 100) / 100

// ------------------------------------------------------------ edit a log row

export function EditLog({ row, onBack, onClose, onSave, onDelete }) {
  const { t, lang } = useLanguage()
  const g = t('nutrition.g')
  const hasGrams = row.grams != null
  // Units this row can be edited in: its own household unit, and grams.
  const unitG = row.unit_label && row.unit_qty ? Number(row.grams) / Number(row.unit_qty) : null
  const options = [
    ...(unitG ? [{ key: 'u', label: logUnit(row, lang), g: unitG, step: 0.5 }] : []),
    { key: 'g', label: g, g: 1, step: 10 },
  ]
  const [oi, setOi] = useState(0)
  const [qty, setQty] = useState(() => String(unitG ? row.unit_qty : round1(row.grams)))
  const [meal, setMeal] = useState(row.meal)
  const [vals, setVals] = useState({
    name: row.name,
    protein: String(row.protein),
    kcal: String(row.kcal),
    carbs: String(row.carbs),
    fat: String(row.fat),
  })
  const [busy, setBusy] = useState(false)
  const [start] = useState(() => JSON.stringify({ qty, meal, vals }))
  useDirtyForm(JSON.stringify({ qty, meal, vals }) !== start)
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

  async function save() {
    if (!valid || busy) return
    setBusy(true)
    const patch = hasGrams
      ? {
          meal,
          grams: newGrams,
          unit_qty: opt.key === 'u' ? q : unitG ? round2(newGrams / unitG) : row.unit_qty,
          kcal: scaled('kcal'),
          protein: scaled('protein'),
          carbs: scaled('carbs'),
          fat: scaled('fat'),
        }
      : {
          meal,
          name: vals.name.trim() || row.name,
          kcal: round1(num(vals.kcal)),
          protein: round1(num(vals.protein)),
          carbs: round1(num(vals.carbs)),
          fat: round1(num(vals.fat)),
        }
    try {
      await onSave(row.id, patch)
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
        <Button variant="danger" onClick={() => onDelete(row.id)} aria-label={t('nutrition.delete')} className="min-h-[52px] px-4">
          <Trash2 size={18} /> {t('nutrition.delete')}
        </Button>
        <Button variant="brass" onClick={save} disabled={!valid || busy} className="flex-1 min-h-[52px] text-base">
          <Check size={20} /> {t('nutrition.save')}
        </Button>
      </div>
    </>
  )
}

// ------------------------------------------------------------ daily targets

export function TargetsView({ targets, onBack, onClose, onSave }) {
  const { t } = useLanguage()
  const g = t('nutrition.g')
  const [kcalText, setKcalText] = useState(targets?.kcal != null ? String(targets.kcal) : '')
  const [split, setSplit] = useState(() => splitFromTargets(targets))
  // The split before the current slider started moving; the other two keep
  // its ratio. Replaced whenever a different slider is touched.
  const [anchor, setAnchor] = useState({ key: null, split })
  const [start] = useState({ kcalText, split })
  useDirtyForm(kcalText !== start.kcalText || MACROS.some((k) => split[k] !== start.split[k]))
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
      await onSave({ kcal, protein: grams('protein'), carbs: grams('carbs'), fat: grams('fat') })
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <SheetHeader title={t('nutrition.targetsTitle')} onBack={onBack} onClose={onClose} />
      <form onSubmit={submit} className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-5">
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

export function SaveMealView({ defaultName, count, onBack, onClose, onSave }) {
  const { t } = useLanguage()
  const [name, setName] = useState(defaultName)
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      await onSave(name.trim())
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

export function MyMealsView({ uid, date, meal, setMeal, onBack, onClose, onLog }) {
  const { t } = useLanguage()
  const { confirm, toast } = useFeedback()
  const [meals, setMeals] = useState(null)
  const [error, setError] = useState('')
  const g = t('nutrition.g')

  useEffect(() => {
    getSavedMeals(uid)
      .then(setMeals)
      .catch((err) => {
        console.error(err)
        setMeals([])
        setError(friendlyError(err, t, 'nutrition.loadFailed'))
      })
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

  return (
    <>
      <SheetHeader title={t('nutrition.myMealsTitle')} onBack={onBack} onClose={onClose} />
      <div className="px-4 pt-2 shrink-0">
        <MealTabs value={meal} onChange={setMeal} />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] pt-3 flex flex-col gap-3">
        {error && <p className="text-sm" role="alert">{error}</p>}
        {meals && meals.length === 0 && !error && <p className="text-chalkdim text-sm">{t('nutrition.noSavedMeals')}</p>}
        {(meals || []).map((m) => {
          const items = Array.isArray(m.items) ? m.items : []
          const tot = sumLogs(items)
          return (
            <section key={m.id} className="card overflow-hidden">
              <div className="p-4 pb-2">
                <h3 className="text-xl leading-tight"><bdi>{m.name}</bdi></h3>
                <p className="text-chalkdim text-xs mt-0.5">{items.length === 1 ? t('nutrition.itemsOne') : t('nutrition.itemsMany', { n: items.length })}</p>
              </div>
              <ul className="divide-y divide-white/[0.06]">
                {items.map((it, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <Name className="text-sm">{it.name}</Name>
                      {it.grams != null && <p className="text-chalkdim text-xs"><AmountText row={it} /></p>}
                    </div>
                    <div className="text-end shrink-0">
                      <div className="text-sm"><N mono>{fmt(it.protein, 1)}</N> <span className="text-chalkdim text-xs">{g}</span></div>
                      <div className="text-chalkdim text-xs"><N mono>{fmt(it.kcal, 0)}</N> {t('nutrition.kcalUnit')}</div>
                    </div>
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
              <div className="p-3 flex gap-2">
                <Button variant="ghost" className="flex-1 min-h-[48px]" onClick={() => onLog(cloneLogs(items, { uid, date, meal }), t('nutrition.loggedToMeal', { meal: mealLabel(t, meal) }))}>
                  <Plus size={18} /> {t('nutrition.logToMeal', { meal: mealLabel(t, meal) })}
                </Button>
                <Button variant="danger" className="px-3.5 min-h-[48px]" onClick={() => remove(m)} aria-label={t('nutrition.delete')}>
                  <Trash2 size={18} />
                </Button>
              </div>
            </section>
          )
        })}
      </div>
    </>
  )
}
