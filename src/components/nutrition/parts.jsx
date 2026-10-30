import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { BadgeCheck, CheckCircle2, ChevronLeft, ChevronRight, Minus, Plus, X } from 'lucide-react'
import { useLanguage } from '../../context/LanguageContext.jsx'
import { useFeedback } from '../../context/FeedbackContext.jsx'
import { useScrollLock } from '../../lib/scrollLock.js'
import { badgeKind, fmt, logUnit, MEALS, MEAL_KEY } from '../../lib/nutrition.js'

// Number that never gets reordered inside Hebrew text.
export function N({ children, mono = false, className = '' }) {
  return (
    <bdi dir="ltr" className={`${mono ? 'num' : ''} ${className}`}>
      {children}
    </bdi>
  )
}

// A food or product name: isolated for bidi, one line, ellipsis.
export function Name({ children, className = '' }) {
  return (
    <span className={`block truncate ${className}`}>
      <bdi>{children}</bdi>
    </span>
  )
}

export function Forward(props) {
  const { dir } = useLanguage()
  return dir === 'rtl' ? <ChevronLeft {...props} /> : <ChevronRight {...props} />
}
export function Backward(props) {
  const { dir } = useLanguage()
  return dir === 'rtl' ? <ChevronRight {...props} /> : <ChevronLeft {...props} />
}

// Coach-verified foods get one small seal; every other source is plain dim
// text, so a result row stays two lines.
export function SourceLabel({ food, showVerifiedText = false, className = '' }) {
  const { t } = useLanguage()
  const kind = badgeKind(food)
  if (kind === 'coach')
    return (
      <span className={`inline-flex items-center gap-1 text-chalk whitespace-nowrap ${className}`} title={t('nutrition.srcCoach')}>
        <BadgeCheck size={13} aria-hidden="true" />
        <span className={showVerifiedText ? '' : 'sr-only'}>{t('nutrition.srcCoach')}</span>
      </span>
    )
  const key = { moh: 'srcMoh', usda: 'srcUsda', off: 'srcOff' }[kind] || 'srcUser'
  return <span className={`text-chalkdim whitespace-nowrap ${className}`}>{t(`nutrition.${key}`)}</span>
}

export function OffAttribution({ className = '' }) {
  const { t } = useLanguage()
  return (
    <p className={`text-chalkdim text-xs ${className}`}>
      {t('nutrition.attrBefore')}
      <a className="underline hover:text-chalk whitespace-nowrap" href="https://world.openfoodfacts.org" target="_blank" rel="noopener noreferrer">
        Open Food Facts
      </a>
      {t('nutrition.attrMid')}
      <a className="underline hover:text-chalk whitespace-nowrap" href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener noreferrer">
        Open Database License
      </a>
      {t('nutrition.attrAfter')}
    </p>
  )
}

// Same quiet line as OffAttribution, for the Ministry of Health (Tzameret) foods.
export function MohAttribution({ className = '' }) {
  const { t } = useLanguage()
  return <p className={`text-chalkdim text-xs ${className}`}>{t('nutrition.attrMoh')}</p>
}

export function UsdaAttribution({ className = '' }) {
  const { t } = useLanguage()
  return <p className={`text-chalkdim text-xs ${className}`}>{t('nutrition.attrUsda')}</p>
}

// Protein is the one measure in the accent; every other bar is neutral grey.
export const TONE = {
  protein: { bar: 'bg-accent' },
  kcal: { bar: 'bg-[#8A8A90]' },
  carbs: { bar: 'bg-[#8A8A90]' },
  fat: { bar: 'bg-[#8A8A90]' },
  water: { bar: 'bg-[#8A8A90]' },
}

export function Track({ value, max, size = 'md', tone = 'fat' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  const h = size === 'sm' ? 'h-1' : tone === 'kcal' ? 'h-1' : 'h-1.5'
  return (
    <div className={`${h} rounded-full bg-[#232326] overflow-hidden`} aria-hidden="true">
      <div
        className={`${(TONE[tone] || TONE.fat).bar} h-full rounded-full transition-[width] duration-300 ease-[var(--ease-out)] motion-reduce:transition-none`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// Quiet label for a measure. No colour dot: the bar says which is which.
export function ToneLabel({ children, plain = false }) {
  return (
    <span className={`${plain ? 'text-xs text-chalkdim' : 'eyebrow'} inline-flex items-center gap-1.5`}>
      {children}
    </span>
  )
}

const MEAL_SHORT = { breakfast: 'mealShortBreakfast', lunch: 'mealShortLunch', dinner: 'mealShortDinner', snack: 'mealShortSnack' }

// Selected chip look shared with the rest of the app (Stats metric toggles).
const ON = 'bg-chalk text-ink font-medium'
const OFF = 'bg-surface2 text-chalkdim hover:text-chalk'

// Four meals as one segmented row: the choice is visible without opening
// anything, and it takes one tap.
export function MealTabs({ value, onChange, className = '' }) {
  const { t } = useLanguage()
  return (
    <div role="radiogroup" aria-label={t('nutrition.meal')} className={`grid grid-cols-4 gap-1 p-1 rounded-[14px] bg-surface2 ${className}`}>
      {MEALS.map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={value === m}
          aria-label={t(MEAL_KEY[m])}
          onClick={() => onChange(m)}
          className={`min-h-[40px] px-1 rounded-[11px] text-sm font-medium truncate press transition-colors ${value === m ? 'bg-chalk text-ink' : 'text-chalkdim hover:text-chalk'}`}
        >
          {t(`nutrition.${MEAL_SHORT[m]}`)}
        </button>
      ))}
    </div>
  )
}

// Household units as one row of chips; the chip says what one unit weighs.
export function UnitChips({ options, value, onChange, scroll = false }) {
  const { t } = useLanguage()
  const g = t('nutrition.g')
  return (
    <div
      role="radiogroup"
      aria-label={t('nutrition.unit')}
      className={`flex gap-2 ${scroll ? 'overflow-x-auto scrollbar-thin -mx-4 px-4 pb-0.5' : 'flex-wrap justify-center'}`}
    >
      {options.map((o, i) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={i === value}
          onClick={() => onChange(i)}
          className={`min-h-[40px] px-3.5 rounded-full text-sm whitespace-nowrap shrink-0 press ${i === value ? ON : OFF}`}
        >
          <bdi>{o.label}</bdi>
          {o.kind === 'unit' && (
            <span className="text-xs opacity-75 ms-1.5">
              <N>{fmt(o.g, 1)}</N> {g}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

// The amount as the one big thing on the screen: round - and + either side
// of the number, the unit and the weight underneath.
export function AmountControl({ value, unit, grams, onChange, onStep }) {
  const { t } = useLanguage()
  const b = 'w-12 h-12 rounded-full bg-surface2 inline-flex items-center justify-center text-chalk hover:bg-surface2/70 press shrink-0'
  const len = Math.max(1, String(value).length)
  const showGrams = grams > 0 && unit !== t('nutrition.g')
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center justify-center gap-5 w-full">
        <button type="button" aria-label={t('nutrition.less')} onClick={() => onStep(-1)} className={b}>
          <Minus size={20} />
        </button>
        <input
          inputMode="decimal"
          aria-label={t('nutrition.amount')}
          dir="ltr"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
          onFocus={(e) => e.target.select()}
          style={{ width: `${Math.min(len, 6) + 1}ch` }}
          className="num !bg-transparent !border-0 !border-b !border-transparent focus:!border-accent !rounded-none !px-0 !py-0 !min-h-[52px] text-center !text-[40px] leading-none"
        />
        <button type="button" aria-label={t('nutrition.more')} onClick={() => onStep(1)} className={b}>
          <Plus size={20} />
        </button>
      </div>
      <p className="text-sm text-chalkdim text-center min-h-[20px]">
        {unit && <bdi>{unit}</bdi>}
        {showGrams && (
          <>
            {' '}
            · <N mono>{fmt(grams, 1)}</N> {t('nutrition.g')}
          </>
        )}
      </p>
    </div>
  )
}

// What the chosen amount adds: protein first and largest, then the rest on
// one quiet row. A flat panel, not a bordered card inside a card.
export function MacroPanel({ macros, proteinTarget, dayProtein, compact = false }) {
  const { t } = useLanguage()
  const g = t('nutrition.g')
  const k = t('nutrition.kcalUnit')
  const rest = [
    ['kcal', t('nutrition.calories'), macros.kcal, k, 0],
    ['carbs', t('nutrition.carbs'), macros.carbs, g, 1],
    ['fat', t('nutrition.fat'), macros.fat, g, 1],
  ]
  return (
    <div className={`rounded-[14px] bg-surface2 ${compact ? 'px-3.5 py-3' : 'p-4'}`}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <ToneLabel plain>{t('nutrition.protein')}</ToneLabel>
          <div className="flex items-baseline gap-1 mt-0.5" data-macro="protein">
            <N mono className={`text-chalk leading-none ${compact ? 'text-[28px]' : 'text-[34px]'}`}>{fmt(macros.protein, 1)}</N>
            <span className="text-chalkdim text-sm">{g}</span>
          </div>
        </div>
        <dl className="flex gap-4 text-end shrink-0">
          {rest.map(([tone, label, v, u, d]) => (
            <div key={tone} className="min-w-0">
              <dt className="text-chalkdim text-xs inline-flex items-center gap-1.5">
                {label}
              </dt>
              <dd className="text-base">
                <N mono>{fmt(v, d)}</N> <span className="text-chalkdim text-xs">{u}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
      {proteinTarget > 0 && (
        <div className="mt-3">
          <Track value={dayProtein} max={proteinTarget} tone="protein" size="sm" />
          <p className="text-chalkdim text-xs mt-1.5">{t('nutrition.pctOfGoal', { n: fmt((macros.protein / proteinTarget) * 100, 0) })}</p>
        </div>
      )}
    </div>
  )
}

// Name, then "brand · source" on one quiet line; a product photo if there is one.
export function FoodHeading({ name, food, image, as: H = 'h2', size = 'text-2xl', children }) {
  return (
    <div className="flex gap-3 items-center min-w-0">
      {image && <img src={image} alt="" className="w-14 h-14 rounded-lg object-contain bg-white shrink-0" />}
      <div className="min-w-0 flex-1">
        <H className={`${size} leading-tight line-clamp-2 break-words`}>
          <bdi>{name}</bdi>
        </H>
        {food && (
          <p className="text-sm text-chalkdim flex items-center gap-1.5 flex-wrap mt-0.5">
            {food.brand && (
              <>
                <bdi className="truncate max-w-[60%]">{food.brand}</bdi>
                <span aria-hidden="true">·</span>
              </>
            )}
            <SourceLabel food={food} showVerifiedText />
          </p>
        )}
      </div>
      {children}
    </div>
  )
}

// Macro inputs with the same colour dots as the rest of the page.
export function MacroInputs({ values, onChange, per = '' }) {
  const { t } = useLanguage()
  const g = t('nutrition.g')
  const fields = [
    ['protein', t('nutrition.protein'), g],
    ['kcal', t('nutrition.calories'), t('nutrition.kcalUnit')],
    ['carbs', t('nutrition.carbs'), g],
    ['fat', t('nutrition.fat'), g],
  ]
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-3">
      {fields.map(([k, label, unit]) => (
        <label key={k} className="flex flex-col gap-1.5 min-w-0">
          <span className="text-sm text-chalkdim inline-flex items-center gap-1.5">
            <span className="truncate">{label}</span>
          </span>
          <span className="relative" dir="ltr">
            <input
              inputMode="decimal"
              dir="ltr"
              placeholder="0"
              className="num w-full !text-lg !pe-12"
              value={values[k]}
              onChange={(e) => onChange(k, e.target.value)}
            />
            <span className="absolute end-3 top-1/2 -translate-y-1/2 text-xs text-chalkdim pointer-events-none">
              {unit}
              {per}
            </span>
          </span>
        </label>
      ))}
    </div>
  )
}

// Joined  - [ number unit ] +  ; the order follows the text direction (water).
export function Stepper({ value, unit, onChange, onStep }) {
  const { t } = useLanguage()
  const b = 'w-12 min-h-[48px] inline-flex items-center justify-center text-xl text-chalk hover:bg-surface2 press shrink-0'
  const len = Math.max(1, String(value).length)
  return (
    <div className="flex items-stretch rounded-[14px] bg-surface2 overflow-hidden">
      <button type="button" aria-label={t('nutrition.less')} onClick={() => onStep(-1)} className={b}>
        −
      </button>
      <div className="flex-1 min-w-0 flex items-center justify-center gap-1.5 bg-surface px-2">
        <input
          inputMode="decimal"
          aria-label={t('nutrition.amount')}
          dir="ltr"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
          style={{ width: `${len + 1.5}ch` }}
          className="num !bg-transparent !border-0 !p-0 !min-h-0 text-center text-[22px] !rounded-none"
        />
        {unit && (
          <span className="text-chalkdim text-sm truncate max-w-[45%]">
            <bdi>{unit}</bdi>
          </span>
        )}
      </div>
      <button type="button" aria-label={t('nutrition.more')} onClick={() => onStep(1)} className={b}>
        +
      </button>
    </div>
  )
}

// ---- unsaved-changes guard
// A form calls useDirtyForm(hasTypedSomething). Whoever closes the sheet
// calls ask(): it resolves true right away when nothing is typed, otherwise
// after the person confirms "Discard". Saving closes without asking.
const DirtyContext = createContext(null)

export function useDiscardGuard() {
  const { confirm } = useFeedback()
  const { t } = useLanguage()
  const forms = useRef(new Map())
  const asking = useRef(false)
  const ask = useCallback(
    async (keys) => {
      const dirty = [...forms.current].some(([k, v]) => v && (keys == null || keys.includes(k)))
      if (!dirty) return true
      if (asking.current) return false // Escape while the question is up
      asking.current = true
      try {
        const ok = await confirm({
          title: t('nutrition.discardTitle'),
          body: t('nutrition.discardBody'),
          confirmLabel: t('nutrition.discardConfirm'),
          cancelLabel: t('nutrition.keepEditing'),
          danger: true,
        })
        if (ok) for (const k of keys ?? [...forms.current.keys()]) forms.current.delete(k)
        return ok
      } finally {
        asking.current = false
      }
    },
    [confirm, t],
  )
  return useMemo(() => ({ forms, ask }), [ask])
}

// Gives the forms inside it a key in the guard (a sheet view, by position).
export function DirtyScope({ guard, id, children }) {
  const set = useCallback((dirty) => guard.forms.current.set(id, dirty), [guard, id])
  return <DirtyContext.Provider value={set}>{children}</DirtyContext.Provider>
}

export function useDirtyForm(dirty) {
  const set = useContext(DirtyContext)
  useEffect(() => {
    set?.(!!dirty)
  }, [dirty, set])
  useEffect(() => () => set?.(false), [set])
}

// Modal panel in the app's own card style. Children are the stacked views;
// only the last is visible, but earlier ones stay mounted so a search or a
// tab is still there when you come back.
export function Sheet({ onClose, children, label }) {
  useScrollLock(true)
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div
      className="nutrition-page fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 pt-[calc(env(safe-area-inset-top,0px)+0.625rem)] sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg h-full sm:h-[min(44rem,calc(100dvh-2rem))] bg-surface rounded-t-[28px] rounded-b-none sm:rounded-b-[28px] flex flex-col overflow-hidden animate-sheet motion-reduce:animate-none"
      >
        <div className="mx-auto mt-2.5 mb-1 h-1 w-9 rounded-full bg-white/20 shrink-0" aria-hidden="true" />
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function SheetHeader({ title, onBack, onClose, right }) {
  const { t } = useLanguage()
  return (
    <div className="flex items-center gap-1 px-2 pt-2 shrink-0">
      {onBack && (
        <button type="button" onClick={onBack} aria-label={t('nutrition.back')} className="w-11 h-11 inline-flex items-center justify-center rounded-full hover:bg-surface2 shrink-0">
          <Backward size={22} />
        </button>
      )}
      <h2 className={`text-[17px] flex-1 min-w-0 truncate ${onBack ? '' : 'ps-2'}`}>{title}</h2>
      {right}
      {onClose && (
        <button type="button" onClick={onClose} aria-label={t('nutrition.close')} className="w-11 h-11 inline-flex items-center justify-center rounded-full hover:bg-surface2 shrink-0">
          <X size={22} />
        </button>
      )}
    </div>
  )
}

// Neutral toast at the top of the screen, with an Undo button. It sits over the header only, never over the controls.
export function UndoToast({ toast, onUndo }) {
  const { t } = useLanguage()
  if (!toast) return null
  return createPortal(
    <div
      className="fixed inset-x-0 z-[60] flex justify-center px-4 pointer-events-none"
      // Bottom, above the tab bar: at the top it covered the sheet's close button.
      style={{ bottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto flex items-center gap-2.5 rounded-[16px] bg-surface2 text-chalk ps-4 pe-1.5 py-1.5 text-sm font-medium w-full max-w-sm shadow-lg">
        <CheckCircle2 size={20} className="shrink-0 text-chalkdim" />
        <span className="flex-1 min-w-0 truncate">{toast.message}</span>
        {toast.ids?.length > 0 && (
          <button type="button" onClick={onUndo} className="min-h-[44px] px-3 rounded-full font-semibold text-chalk hover:bg-white/10 shrink-0">
            {t('nutrition.undo')}
          </button>
        )}
      </div>
    </div>,
    document.body,
  )
}

export const mealLabel = (t, m) => t(MEAL_KEY[m])

// "2 medium slices · 68 g" with every number and name isolated, so a Hebrew
// unit name inside an English page (or the reverse) keeps its order.
export function AmountText({ row }) {
  const { t, lang } = useLanguage()
  if (row.grams == null) return null
  const g = t('nutrition.g')
  return (
    <>
      {row.unit_label && row.unit_qty != null && (
        <>
          <N>{fmt(row.unit_qty, 2)}</N> <bdi>{logUnit(row, lang)}</bdi> ·{' '}
        </>
      )}
      <N>{fmt(row.grams, 1)}</N> {g}
    </>
  )
}
