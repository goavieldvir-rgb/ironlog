import React, { useState } from 'react'
import { BadgeCheck, Plus, Star } from 'lucide-react'
import { useLanguage } from '../../context/LanguageContext.jsx'
import { useFeedback } from '../../context/FeedbackContext.jsx'
import { Button } from '../ui.jsx'
import { approveFood, fmt, foodName, friendlyError, isFavorite, toggleFavorite } from '../../lib/nutrition.js'
import { useAmount } from './useAmount.js'
import { MealSelect, N, OffAttribution, SheetHeader, SourceLabel, Stepper, TONE, ToneLabel, Track, mealLabel } from './parts.jsx'

// Amount screen: pick a unit and quantity, see protein first, then add.
export default function FoodDetail({ food: initial, meal, setMeal, targets, totals, favUid, isAdmin, onBack, onClose, onLog, onFoodChange }) {
  const { t, lang } = useLanguage()
  const { toast } = useFeedback()
  const [food, setFood] = useState(initial)
  const a = useAmount(food)
  const [fav, setFav] = useState(() => isFavorite(favUid, food))
  const [busy, setBusy] = useState(false)
  const name = foodName(food, lang) || t('nutrition.unnamed')
  const g = t('nutrition.g')
  const k = t('nutrition.kcalUnit')

  async function approve() {
    try {
      const updated = await approveFood(food.id)
      setFood(updated)
      onFoodChange?.(updated)
    } catch (err) {
      console.error(err)
      toast(friendlyError(err, t, 'nutrition.approveFailed'), 'error')
    }
  }

  async function add() {
    if (!a.valid || busy) return
    setBusy(true)
    try {
      await onLog(food, a.option, a.q, meal)
    } finally {
      setBusy(false)
    }
  }

  const pTarget = targets?.protein
  const dayP = (totals?.protein || 0) + a.macros.protein

  return (
    <>
      <SheetHeader
        onBack={onBack}
        onClose={onClose}
        title=""
        right={
          food.id ? (
            <button
              type="button"
              aria-pressed={fav}
              aria-label={t('nutrition.favorite')}
              onClick={() => setFav(toggleFavorite(favUid, food))}
              className="w-11 h-11 inline-flex items-center justify-center rounded-md hover:bg-surface2"
            >
              <Star size={22} className={fav ? 'text-chalk' : 'text-chalkdim'} fill={fav ? 'currentColor' : 'none'} />
            </button>
          ) : null
        }
      />
      <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-4">
        <div>
          <div className="eyebrow flex items-center gap-2 flex-wrap mb-1">
            <SourceLabel food={food} showVerifiedText />
            {food.brand && (
              <>
                <span aria-hidden="true">·</span>
                <span className="normal-case tracking-normal"><bdi>{food.brand}</bdi></span>
              </>
            )}
          </div>
          <h2 className="text-2xl leading-tight line-clamp-3 break-words">
            <bdi>{name}</bdi>
          </h2>
          {isAdmin && !food.verified && food.source !== 'moh' && food.id && (
            <Button variant="ghost" className="mt-2" onClick={approve}>
              <BadgeCheck size={16} /> {t('nutrition.approve')}
            </Button>
          )}
        </div>

        <div>
          <label className="eyebrow block mb-1.5">{t('nutrition.meal')}</label>
          <MealSelect value={meal} onChange={setMeal} />
        </div>

        <div className="card p-4 flex flex-col gap-3">
          <div className="eyebrow">{t('nutrition.amount')}</div>
          <Stepper value={a.qty} unit={a.option.kind === 'g' ? g : a.option.kind === '100g' ? '× 100 ' + g : a.option.label} onChange={a.setQty} onStep={a.step} />
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('nutrition.unit')}>
            {a.options.map((o, i) => (
              <button
                key={o.key}
                type="button"
                aria-pressed={i === a.unitIdx}
                onClick={() => a.setUnit(i)}
                className={`min-h-[44px] px-3 rounded-md border text-sm text-start press ${i === a.unitIdx ? 'border-chalk bg-surface2 text-chalk' : 'border-line text-chalkdim'}`}
              >
                <bdi>{o.label}</bdi>
                {o.kind === 'unit' && <span className="num text-xs text-chalkdim ms-1.5"><N>{fmt(o.g, 1)} {g}</N></span>}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {[0.5, 1, 2].map((m) => (
              <button key={m} type="button" onClick={() => a.mult(m)} dir="ltr" className="num min-h-[44px] min-w-[64px] px-3 rounded-md border border-line bg-surface2 text-sm press">
                ×{m}
              </button>
            ))}
            <span className="text-chalkdim text-sm ms-auto whitespace-nowrap">
              {t('nutrition.total')} <N mono className="text-chalk">{fmt(a.grams, 1)}</N> {g}
            </span>
          </div>
        </div>

        <div className="card p-4">
          <ToneLabel tone="protein">{t('nutrition.protein')}</ToneLabel>
          <div className="flex items-baseline gap-1.5 mt-1">
            <N mono className="text-3xl leading-none">{fmt(a.macros.protein, 1)}</N>
            <span className="text-chalkdim text-sm">{g}</span>
          </div>
          {pTarget > 0 && (
            <div className="mt-2.5">
              <Track value={dayP} max={pTarget} tone="protein" />
              <p className="text-chalkdim text-xs mt-1.5">{t('nutrition.pctOfGoal', { n: fmt((a.macros.protein / pTarget) * 100, 0) })}</p>
            </div>
          )}
          <dl className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-line">
            {[
              ['kcal', t('nutrition.calories'), a.macros.kcal, k],
              ['carbs', t('nutrition.carbs'), a.macros.carbs, g],
              ['fat', t('nutrition.fat'), a.macros.fat, g],
            ].map(([tone, label, v, u]) => (
              <div key={tone} className="min-w-0">
                <dt className="text-chalkdim text-xs truncate inline-flex items-center gap-1.5 max-w-full">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${TONE[tone].dot}`} aria-hidden="true" />
                  <span className="truncate">{label}</span>
                </dt>
                <dd className="text-base">
                  <N mono>{fmt(v, 1)}</N> <span className="text-chalkdim text-xs">{u}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="text-chalkdim text-xs">
          {t('nutrition.per100Line')}: <N mono>{fmt(food.protein, 1)}</N> {g} {t('nutrition.proteinWord')} · <N mono>{fmt(food.kcal, 0)}</N> {k} ·{' '}
          <N mono>{fmt(food.carbs, 1)}</N> {g} {t('nutrition.carbs')} · <N mono>{fmt(food.fat, 1)}</N> {g} {t('nutrition.fat')}
        </p>
        {food.source === 'off' && <OffAttribution />}
      </div>
      <div className="p-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] border-t border-line shrink-0">
        <Button variant="brass" className="w-full min-h-[52px] text-base justify-between" onClick={add} disabled={!a.valid || busy}>
          <span className="inline-flex items-center gap-2">
            <Plus size={20} />
            {t('nutrition.addToButton', { meal: mealLabel(t, meal) })}
          </span>
          <span className="font-normal text-sm opacity-80"><N mono>{fmt(a.macros.protein, 1)}</N> {g} {t('nutrition.proteinWord')}</span>
        </Button>
      </div>
    </>
  )
}
