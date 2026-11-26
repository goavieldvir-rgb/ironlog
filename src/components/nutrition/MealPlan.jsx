import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Plus, Search, Trash2, X } from 'lucide-react'
import { useLanguage } from '../../context/LanguageContext.jsx'
import { useFeedback } from '../../context/FeedbackContext.jsx'
import { Button } from '../ui.jsx'
import {
  ALL_MEALS,
  buildUnitOptions,
  fmt,
  foodLogRow,
  foodName,
  friendlyError,
  logName,
  mealItem,
  round1,
  saveCoachPlan,
  scaleMacros,
  searchFoods,
  sumLogs,
  unitLabel,
} from '../../lib/nutrition.js'
import { dayTotals, parseMealPlan } from '../../lib/mealPlan.js'
import { AmountText, N, SheetHeader, mealLabel, useDirtyForm } from './parts.jsx'

// ---------------------------------------------------------------- day view
// The whole plan on one page: every meal slot with its options, swaps and
// macros, and the day against the targets. Same page for coach and trainee.

const Macros = ({ tot, g, k, t }) => (
  <span className="text-chalkdim text-[13px] whitespace-nowrap">
    <N mono className="text-chalk font-semibold">{fmt(tot.kcal, 0)}</N> {k} · <N mono>{fmt(tot.protein, 0)}</N> {t('nutrition.proteinLetter')} ·{' '}
    <N mono>{fmt(tot.carbs, 0)}</N> {t('nutrition.carbsLetter')} · <N mono>{fmt(tot.fat, 0)}</N> {t('nutrition.fatLetter')}
  </span>
)

export function MealPlanView({ coachMeals, targets, coach, onImport, onManage, onBack, onClose }) {
  const { t, lang } = useLanguage()
  const g = t('nutrition.g')
  const k = t('nutrition.kcalUnit')
  const slots = ALL_MEALS.filter((m) => coachMeals.some((o) => o.meal === m))
  const day = dayTotals(coachMeals, sumLogs)
  const tgt = (v) => (v != null ? <> {t('nutrition.of')} <N mono>{fmt(v, 0)}</N></> : null)
  return (
    <>
      <SheetHeader title={t('nutrition.planTitle')} onBack={onBack} onClose={onClose} />
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] pt-3 flex flex-col gap-3">
        {slots.length === 0 && <p className="text-chalkdim text-sm">{coach ? t('nutrition.planEmptyCoach') : t('nutrition.planEmpty')}</p>}
        {slots.length > 0 && (
          <section className="bg-surface2 rounded-[18px] px-4 py-3 flex flex-col gap-1" aria-label={t('nutrition.planDay')}>
            <div className="eyebrow">{t('nutrition.planDay')}</div>
            <Macros tot={day} g={g} k={k} t={t} />
            {targets && (
              <span className="text-chalkdim text-xs">
                {t('nutrition.planTarget')}: <N mono>{fmt(targets.kcal, 0)}</N> {k}
                {targets.protein != null && <> · <N mono>{fmt(targets.protein, 0)}</N> {g} {t('nutrition.proteinWord')}</>}
              </span>
            )}
          </section>
        )}
        {slots.map((m) => {
          const opts = coachMeals.filter((o) => o.meal === m)
          return (
            <section key={m} className="flex flex-col gap-2" aria-label={mealLabel(t, m)}>
              <h3 className="text-[15px] font-semibold">{mealLabel(t, m)}</h3>
              {opts.map((o, n) => {
                const items = Array.isArray(o.items) ? o.items : []
                return (
                  <div key={o.id} className="bg-surface rounded-[18px] px-4 py-3 flex flex-col gap-1.5 border border-white/[0.06]">
                    <div className="flex items-baseline justify-between gap-3">
                      <span dir="auto" className="text-[14px] font-medium truncate text-start">
                        {opts.length > 1 ? t('nutrition.planOption', { n: n + 1 }) : ''}
                        {opts.length > 1 && o.name ? ' · ' : ''}
                        {o.name && (opts.length > 1 || o.name !== mealLabel(t, m)) ? o.name : ''}
                      </span>
                    </div>
                    <Macros tot={sumLogs(items)} g={g} k={k} t={t} />
                    <ul className="flex flex-col divide-y divide-white/[0.06]">
                      {items.map((it, i) => (
                        <li key={i} className="py-1.5 text-[13px] leading-[18px]">
                          <span dir="auto" className="block text-start">
                            {logName(it, lang)}
                            {it.grams != null && <span className="text-chalkdim"> · <AmountText row={it} /></span>}
                          </span>
                          {(it.alts || []).map((a, j) => (
                            <span key={j} dir="auto" className="block text-start text-chalkdim">
                              {t('nutrition.planOr')} {logName(a, lang)}
                              {a.grams != null && <> · <AmountText row={a} /></>}
                            </span>
                          ))}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </section>
          )
        })}
        {coach && (
          <div className="flex flex-col gap-2 pt-1">
            <Button className="w-full min-h-[44px]" onClick={onImport}>
              <Plus size={16} /> {t('nutrition.planImport')}
            </Button>
            {slots.length > 0 && (
              <Button variant="ghost" className="w-full min-h-[44px]" onClick={onManage}>
                {t('nutrition.planManage')}
              </Button>
            )}
          </div>
        )}
      </div>
    </>
  )
}

// ---------------------------------------------------------------- import

const UNIT_MATCH = {
  cup: /cup|כוס/i,
  tbsp: /tbsp|tablespoon|כף(?!ית)/i,
  tsp: /tsp|teaspoon|כפית/i,
  slice: /slice|פרוסה/i,
  scoop: /scoop|סקופ/i,
  piece: /piece|unit|יח/i,
}

// How much of `food` a parsed amount is: grams, plus the household unit it
// came as (so "3 eggs" stays "3 eggs"), and whether the coach should check it.
function amountFor(food, p) {
  if (!food) return { grams: null, unit: null, check: false }
  if (p.unit === 'g' && p.qty) return { grams: round1(p.qty), unit: null, check: false }
  const units = (Array.isArray(food.units) ? food.units : []).filter((u) => Number(u?.g) > 0)
  const q = p.qty || 1
  const hit = p.unit && UNIT_MATCH[p.unit] ? units.find((u) => UNIT_MATCH[p.unit].test(`${u.en || ''} ${u.he || ''}`)) : null
  const u = hit || (units.length ? units[0] : null)
  if (!u) return { grams: round1(q * 100), unit: null, check: true }
  return { grams: round1(q * u.g), unit: { u, qty: q }, check: !p.qty || (!!p.unit && !hit) }
}

async function resolveChoice(c, uid) {
  let food = null
  try {
    food = (await searchFoods(c.query, { uid }))[0] || null
  } catch (err) {
    console.error(err)
  }
  return { ...c, pQty: c.qty, pUnit: c.unit, key: Math.random().toString(36).slice(2), food, ...amountFor(food, { qty: c.qty, unit: c.unit }) }
}

// One parsed choice as a saved-meal item.
function choiceItem(c, lang, t) {
  const opts = buildUnitOptions(c.food, lang, t)
  let option = opts.find((o) => o.kind === 'g')
  let qty = c.grams
  if (c.unit) {
    option = { kind: 'unit', label: unitLabel(c.unit.u, lang), g: Number(c.unit.u.g) }
    qty = c.unit.qty
  }
  return mealItem(foodLogRow({ uid: null, date: null, meal: null, food: c.food, lang, option, qty }))
}

const choiceMacros = (c) => (c.food && c.grams > 0 ? scaleMacros(c.food, c.grams) : { kcal: 0, protein: 0, carbs: 0, fat: 0 })

function ChoiceRow({ c, first, uid, onChange, onRemove }) {
  const { t, lang } = useLanguage()
  const [searching, setSearching] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState(null)
  const seq = useRef(0)
  const m = choiceMacros(c)

  useEffect(() => {
    if (!searching || !q.trim()) {
      seq.current++
      setResults(null)
      return undefined
    }
    const id = ++seq.current
    const h = setTimeout(() => {
      searchFoods(q, { uid })
        .then((r) => id === seq.current && setResults(r.slice(0, 6)))
        .catch((err) => console.error(err))
    }, 250)
    return () => clearTimeout(h)
  }, [q, searching, uid])

  const pick = (food) => {
    onChange({ ...c, food, gramsText: undefined, ...amountFor(food, { qty: c.pQty, unit: c.pUnit }) })
    setSearching(false)
    setQ('')
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        {!first && <span className="text-chalkdim text-xs shrink-0">{t('nutrition.planOr')}</span>}
        <div className="min-w-0 flex-1">
          <span dir="auto" className={`block truncate text-[14px] text-start ${c.food ? '' : 'text-brass'}`}>
            {c.food ? foodName(c.food, lang) : t('nutrition.importNoFood', { name: c.orig })}
          </span>
          {c.food && (
            <span className="block text-chalkdim text-xs">
              <N mono>{fmt(m.kcal, 0)}</N> {t('nutrition.kcalUnit')} · <N mono>{fmt(m.protein, 0)}</N> {t('nutrition.g')} {t('nutrition.proteinWord')}
              {c.unit && <> · <bdi>{`${fmt(c.unit.qty, 2)} ${unitLabel(c.unit.u, lang)}`}</bdi></>}
            </span>
          )}
          {c.check && c.food && <span className="block text-brass text-xs">{t('nutrition.importCheckAmount')}</span>}
        </div>
        <label className="shrink-0 flex items-center gap-1 text-chalkdim text-xs">
          <input
            dir="ltr"
            inputMode="decimal"
            aria-label={t('nutrition.importGrams', { name: c.food ? foodName(c.food, lang) : c.orig })}
            value={c.gramsText ?? c.grams ?? ''}
            onChange={(e) => {
              const raw = e.target.value
              const n = parseFloat(raw.replace(',', '.'))
              onChange({ ...c, gramsText: raw, grams: Number.isFinite(n) && n >= 0 ? n : null, unit: null, check: false })
            }}
            className="w-16 min-h-[40px] rounded-lg bg-surface2 px-2 text-center text-chalk num"
          />
          {t('nutrition.g')}
        </label>
        <button type="button" onClick={() => setSearching((s) => !s)} aria-label={t('nutrition.importChange', { name: c.orig })} className="w-10 h-10 inline-flex items-center justify-center rounded-full text-chalkdim hover:text-chalk press shrink-0">
          <Search size={16} />
        </button>
        <button type="button" onClick={onRemove} aria-label={t('nutrition.importRemove', { name: c.orig })} className="w-10 h-10 -me-2 inline-flex items-center justify-center rounded-full text-chalkdim hover:text-chalk press shrink-0">
          <X size={16} />
        </button>
      </div>
      {searching && (
        <div className="bg-surface2 rounded-xl p-2 flex flex-col gap-1">
          <input
            autoFocus
            dir="auto"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('nutrition.importSearch')}
            aria-label={t('nutrition.importSearch')}
            className="w-full min-h-[40px] rounded-lg bg-surface px-3 text-[14px]"
          />
          {(results || []).map((f) => (
            <button key={f.id} type="button" onClick={() => pick(f)} className="min-h-[40px] px-2 text-start text-[14px] rounded-lg hover:bg-surface truncate" dir="auto">
              {foodName(f, lang)} <span className="text-chalkdim text-xs"><N mono>{fmt(f.kcal, 0)}</N> {t('nutrition.kcalUnit')}<bdi>/100{t('nutrition.g')}</bdi></span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function ImportPlanView({ uid, authUid, existing, onBack, onClose, onSaved }) {
  const { t, lang } = useLanguage()
  const { toast } = useFeedback()
  const [text, setText] = useState('')
  const [meals, setMeals] = useState(null) // null = still pasting
  const [busy, setBusy] = useState(false)
  const [empty, setEmpty] = useState(false)
  useDirtyForm(text.trim() !== '' || meals !== null)

  async function review() {
    const parsed = parseMealPlan(text)
    if (!parsed.length) {
      setEmpty(true)
      return
    }
    setEmpty(false)
    setBusy(true)
    try {
      const out = []
      for (const m of parsed) {
        const items = []
        for (const it of m.items) items.push({ key: Math.random().toString(36).slice(2), choices: await Promise.all(it.choices.map((c) => resolveChoice(c, authUid))) })
        out.push({ key: Math.random().toString(36).slice(2), meal: m.meal, name: m.name, items })
      }
      setMeals(out)
    } finally {
      setBusy(false)
    }
  }

  const setChoice = (mk, ik, ck, next) =>
    setMeals((ms) => ms.map((m) => (m.key !== mk ? m : { ...m, items: m.items.map((it) => (it.key !== ik ? it : { ...it, choices: it.choices.map((c) => (c.key === ck ? next : c)) })) })))
  const removeChoice = (mk, ik, ck) =>
    setMeals((ms) =>
      ms
        .map((m) => (m.key !== mk ? m : { ...m, items: m.items.map((it) => (it.key !== ik ? it : { ...it, choices: it.choices.filter((c) => c.key !== ck) })).filter((it) => it.choices.length) }))
        .filter((m) => m.items.length),
    )

  const bad = useMemo(
    () => (meals || []).some((m) => m.items.some((it) => it.choices.some((c) => !c.food || !(c.grams > 0)))),
    [meals],
  )

  async function save() {
    if (busy || bad || !meals?.length) return
    setBusy(true)
    try {
      const rows = meals.map((m) => {
        const items = m.items.map((it) => {
          const [main, ...alts] = it.choices.map((c) => choiceItem(c, lang, t))
          return alts.length ? { ...main, alts } : main
        })
        return { meal: m.meal, name: (m.name || mealLabel(t, m.meal)).slice(0, 80), items }
      })
      await saveCoachPlan(uid, rows)
      toast(t('nutrition.importSaved', { n: rows.length }))
      onSaved?.()
    } catch (err) {
      console.error(err)
      toast(friendlyError(err, t), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <SheetHeader title={t('nutrition.importTitle')} onBack={onBack} onClose={onClose} />
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] pt-3 flex flex-col gap-3">
        {meals === null ? (
          <>
            <p className="text-chalkdim text-sm">{t('nutrition.importHint')}</p>
            {existing > 0 && <p className="text-chalkdim text-xs">{t('nutrition.importExisting', { n: existing })}</p>}
            <textarea
              dir="auto"
              rows={12}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('nutrition.importPlaceholder')}
              aria-label={t('nutrition.importTitle')}
              className="w-full rounded-[14px] bg-surface2 p-3 text-[14px] leading-5"
            />
            {empty && <p className="text-sm" role="alert">{t('nutrition.importNothing')}</p>}
            <Button className="w-full min-h-[44px]" disabled={busy || !text.trim()} onClick={review}>
              {busy ? t('nutrition.importMatching') : t('nutrition.importReview')}
            </Button>
          </>
        ) : (
          <>
            <p className="text-chalkdim text-sm">{t('nutrition.importCheck')}</p>
            {meals.map((m) => {
              const tot = sumLogs(m.items.map((it) => choiceMacros(it.choices[0])))
              return (
                <section key={m.key} className="bg-surface2 rounded-[18px] p-3 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <select
                      value={m.meal}
                      aria-label={t('nutrition.importSlot')}
                      onChange={(e) => setMeals((ms) => ms.map((x) => (x.key === m.key ? { ...x, meal: e.target.value } : x)))}
                      className="min-h-[40px] rounded-lg bg-surface px-2 text-[14px]"
                    >
                      {ALL_MEALS.map((k) => (
                        <option key={k} value={k}>{mealLabel(t, k)}</option>
                      ))}
                    </select>
                    <span dir="auto" className="flex-1 min-w-0 truncate text-[13px] text-chalkdim text-start">{m.name === mealLabel(t, m.meal) ? '' : m.name}</span>
                    <span className="text-chalkdim text-xs whitespace-nowrap">
                      <N mono>{fmt(tot.kcal, 0)}</N> {t('nutrition.kcalUnit')} · <N mono>{fmt(tot.protein, 0)}</N> {t('nutrition.g')}
                    </span>
                    <button type="button" onClick={() => setMeals((ms) => ms.filter((x) => x.key !== m.key))} aria-label={t('nutrition.importRemoveMeal', { name: m.name })} className="w-10 h-10 -me-2 inline-flex items-center justify-center rounded-full text-chalkdim hover:text-chalk press shrink-0">
                      <Trash2 size={16} />
                    </button>
                  </div>
                  {m.items.map((it) => (
                    <div key={it.key} className="flex flex-col gap-1.5 border-t border-white/[0.06] pt-2">
                      {it.choices.map((c, ci) => (
                        <ChoiceRow key={c.key} c={c} first={ci === 0} uid={authUid} onChange={(next) => setChoice(m.key, it.key, c.key, next)} onRemove={() => removeChoice(m.key, it.key, c.key)} />
                      ))}
                    </div>
                  ))}
                </section>
              )
            })}
            {bad && <p className="text-brass text-sm" role="alert">{t('nutrition.importFix')}</p>}
            <div className="flex gap-2">
              <Button variant="ghost" className="min-h-[44px]" onClick={() => setMeals(null)}>{t('nutrition.importEditText')}</Button>
              <Button className="flex-1 min-h-[44px]" disabled={busy || bad || !meals.length} onClick={save}>
                <Check size={16} /> {t('nutrition.importSave')}
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
