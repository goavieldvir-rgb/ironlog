import React, { useEffect, useState } from 'react'
import { BadgeCheck, Plus, Star } from 'lucide-react'
import { useLanguage } from '../../context/LanguageContext.jsx'
import { useFeedback } from '../../context/FeedbackContext.jsx'
import { Button } from '../ui.jsx'
import { approveFood, fmt, foodName, friendlyError, isFavorite, setFavorite } from '../../lib/nutrition.js'
import { useAmount } from './useAmount.js'
import { AmountControl, FoodHeading, MacroPanel, MealTabs, N, OffAttribution, SheetHeader, UnitChips, mealLabel } from './parts.jsx'

// The words under the amount: "g", "× 100 g" or the household unit.
export const unitText = (option, g) => (option.kind === 'g' ? g : option.kind === '100g' ? '× 100 ' + g : option.label)

// Amount screen: pick a unit and quantity, see protein first, then add.
export default function FoodDetail({ food: initial, meal, setMeal, targets, totals, favUid, isAdmin, onBack, onClose, onLog, onFoodChange }) {
  const { t, lang } = useLanguage()
  const { toast } = useFeedback()
  const [food, setFood] = useState(initial)
  const a = useAmount(food)
  const [fav, setFav] = useState(false)
  useEffect(() => {
    let off = false
    isFavorite(favUid, food)
      .then((v) => !off && setFav(v))
      .catch(() => {})
    return () => {
      off = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favUid, food.id])
  async function toggleFav() {
    const next = !fav
    setFav(next)
    try {
      await setFavorite(favUid, food, next)
    } catch (err) {
      console.error(err)
      setFav(!next)
      toast(friendlyError(err, t), 'error')
    }
  }
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
              onClick={toggleFav}
              className="w-11 h-11 inline-flex items-center justify-center rounded-full hover:bg-surface2"
            >
              <Star size={22} className={fav ? 'text-chalk' : 'text-chalkdim'} fill={fav ? 'currentColor' : 'none'} />
            </button>
          ) : null
        }
      />
      <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-5">
        <div>
          <FoodHeading name={name} food={food} />
          {isAdmin && !food.verified && food.source !== 'moh' && food.id && (
            <Button variant="ghost" className="mt-2" onClick={approve}>
              <BadgeCheck size={16} /> {t('nutrition.approve')}
            </Button>
          )}
        </div>

        <MealTabs value={meal} onChange={setMeal} />

        <div className="flex flex-col gap-4 py-1">
          <AmountControl
            value={a.qty}
            unit={unitText(a.option, g)}
            grams={a.option.kind === 'unit' ? a.grams : 0}
            onChange={a.setQty}
            onStep={a.step}
          />
          <UnitChips options={a.options} value={a.unitIdx} onChange={a.setUnit} />
        </div>

        <MacroPanel macros={a.macros} proteinTarget={pTarget} dayProtein={dayP} />

        <div className="flex flex-col gap-1.5">
          <p className="text-chalkdim text-xs">
            {t('nutrition.per100Line')}: <N mono>{fmt(food.protein, 1)}</N> {g} {t('nutrition.proteinWord')} · <N mono>{fmt(food.kcal, 0)}</N> {k} ·{' '}
            <N mono>{fmt(food.carbs, 1)}</N> {g} {t('nutrition.carbs')} · <N mono>{fmt(food.fat, 1)}</N> {g} {t('nutrition.fat')}
          </p>
          {food.source === 'off' && <OffAttribution />}
        </div>
      </div>
      <div className="p-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] shrink-0">
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
