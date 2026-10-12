import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { BadgeCheck, CheckCircle2, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useLanguage } from '../../context/LanguageContext.jsx'
import { useScrollLock } from '../../lib/scrollLock.js'
import { badgeKind, fmt, MEALS, MEAL_KEY } from '../../lib/nutrition.js'

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
      <span className={`inline-flex items-center gap-1 text-brass whitespace-nowrap ${className}`} title={t('nutrition.srcCoach')}>
        <BadgeCheck size={13} aria-hidden="true" />
        <span className={showVerifiedText ? '' : 'sr-only'}>{t('nutrition.srcCoach')}</span>
      </span>
    )
  const key = kind === 'moh' ? 'srcMoh' : kind === 'off' ? 'srcOff' : 'srcUser'
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

// Each measure keeps one colour everywhere it appears (bar, legend dot):
// protein iron, calories brass, carbs cardio blue, fat chalk, water cardio
// blue. A protein or water bar that reaches its target turns green.
export const TONE = {
  protein: { bar: 'bg-iron', dot: 'bg-iron', text: 'text-irontext' },
  kcal: { bar: 'bg-brass', dot: 'bg-brass', text: 'text-brass' },
  carbs: { bar: 'bg-cardio', dot: 'bg-cardio', text: 'text-cardiotext' },
  fat: { bar: 'bg-chalk', dot: 'bg-chalk', text: 'text-chalk' },
  water: { bar: 'bg-cardio', dot: 'bg-cardio', text: 'text-cardiotext' },
}
const GOAL_TONES = ['protein', 'water']

export function Track({ value, max, size = 'md', tone = 'fat' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  const met = GOAL_TONES.includes(tone) && max > 0 && value >= max
  const h = size === 'sm' ? 'h-1.5' : 'h-2'
  return (
    <div className={`${h} rounded-full bg-surface2 overflow-hidden`} aria-hidden="true">
      <div
        className={`${met ? 'bg-good' : (TONE[tone] || TONE.fat).bar} h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// Eyebrow with the measure's colour dot, the legend for its bar.
export function ToneLabel({ tone, children }) {
  return (
    <span className="eyebrow inline-flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full shrink-0 ${(TONE[tone] || TONE.fat).dot}`} aria-hidden="true" />
      {children}
    </span>
  )
}

export function MealSelect({ value, onChange, className = '' }) {
  const { t } = useLanguage()
  return (
    <select
      aria-label={t('nutrition.meal')}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`min-h-[44px] pe-8 w-full ${className}`}
    >
      {MEALS.map((m) => (
        <option key={m} value={m}>
          {t(MEAL_KEY[m])}
        </option>
      ))}
    </select>
  )
}

// Joined  - [ number unit ] +  ; the order follows the text direction.
export function Stepper({ value, unit, onChange, onStep }) {
  const { t } = useLanguage()
  const b = 'w-12 min-h-[48px] inline-flex items-center justify-center text-xl text-chalk hover:bg-surface2 press shrink-0'
  const len = Math.max(1, String(value).length)
  return (
    <div className="flex items-stretch rounded-md border border-line bg-surface2 overflow-hidden">
      <button type="button" aria-label={t('nutrition.less')} onClick={() => onStep(-1)} className={b}>
        −
      </button>
      <div className="flex-1 min-w-0 flex items-center justify-center gap-1.5 bg-ink px-2">
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
      className="nutrition-page fixed inset-0 z-40 bg-ink/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 pt-[calc(env(safe-area-inset-top,0px)+0.625rem)] sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        className="card relative w-full max-w-lg h-full sm:h-[min(44rem,calc(100dvh-2rem))] rounded-b-none sm:rounded-b-xl flex flex-col overflow-hidden"
      >
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
        <button type="button" onClick={onBack} aria-label={t('nutrition.back')} className="w-11 h-11 inline-flex items-center justify-center rounded-md hover:bg-surface2 shrink-0">
          <Backward size={22} />
        </button>
      )}
      <h2 className={`text-xl flex-1 min-w-0 truncate ${onBack ? '' : 'ps-2'}`}>{title}</h2>
      {right}
      {onClose && (
        <button type="button" onClick={onClose} aria-label={t('nutrition.close')} className="w-11 h-11 inline-flex items-center justify-center rounded-md hover:bg-surface2 shrink-0">
          <X size={22} />
        </button>
      )}
    </div>
  )
}

// Same look as the app's success toast (green, top of the screen), with an
// Undo button. It sits over the header only, never over the controls.
export function UndoToast({ toast, onUndo }) {
  const { t } = useLanguage()
  if (!toast) return null
  return createPortal(
    <div
      className="fixed inset-x-0 z-[60] flex justify-center px-4 pointer-events-none"
      style={{ top: 'calc(0.75rem + env(safe-area-inset-top, 0px))' }}
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto flex items-center gap-2.5 rounded-lg bg-green-800 text-white ps-4 pe-1.5 py-1.5 text-sm font-medium w-full max-w-sm shadow-lg border border-green-600">
        <CheckCircle2 size={20} className="shrink-0" />
        <span className="flex-1 min-w-0 truncate">{toast.message}</span>
        {toast.ids?.length > 0 && (
          <button type="button" onClick={onUndo} className="min-h-[44px] px-3 rounded-md font-semibold underline underline-offset-2 hover:bg-green-700 shrink-0">
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
  const { t } = useLanguage()
  if (row.grams == null) return null
  const g = t('nutrition.g')
  return (
    <>
      {row.unit_label && row.unit_qty != null && (
        <>
          <N>{fmt(row.unit_qty, 2)}</N> <bdi>{row.unit_label}</bdi> ·{' '}
        </>
      )}
      <N>{fmt(row.grams, 1)}</N> {g}
    </>
  )
}
