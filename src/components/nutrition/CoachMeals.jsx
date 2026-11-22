import React, { useEffect, useState } from 'react'
import { Check, Plus, Repeat } from 'lucide-react'
import { useLanguage } from '../../context/LanguageContext.jsx'
import { useFeedback } from '../../context/FeedbackContext.jsx'
import { Button } from '../ui.jsx'
import { copyCoachMeal, fmt, friendlyError, getCoachLibrary, logName, pickItems, sumLogs } from '../../lib/nutrition.js'
import { AmountText, MealTabs, N, SheetHeader, mealLabel } from './parts.jsx'

// ------------------------------------------------------------ in the diary
// One coach option in an empty meal slot: the planned foods, a swap per food
// where the coach gave one, and one tap to log it all.

export function CoachMealCard({ m, onLog }) {
  const { t, lang } = useLanguage()
  const [picks, setPicks] = useState({}) // item index -> 0 planned, k = alts[k-1]
  const [busy, setBusy] = useState(false)
  const items = Array.isArray(m.items) ? m.items : []
  const chosen = pickItems(items, picks)
  const tot = sumLogs(chosen)
  const g = t('nutrition.g')

  const cycle = (i) => setPicks((p) => ({ ...p, [i]: ((p[i] || 0) + 1) % ((items[i].alts?.length || 0) + 1) }))

  async function log() {
    if (busy || !chosen.length) return
    setBusy(true)
    try {
      await onLog(chosen, m)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="bg-surface rounded-[18px] overflow-hidden" aria-label={`${t('nutrition.fromCoach')}: ${m.name}`}>
      <div className="flex items-start justify-between gap-3 px-4 pt-3">
        <div className="min-w-0">
          <div className="eyebrow">{t('nutrition.fromCoach')}</div>
          <h3 dir="auto" className="text-[15px] leading-5 font-medium mt-0.5 text-start truncate">{m.name}</h3>
        </div>
        <div className="text-end shrink-0 text-[13px] text-chalkdim whitespace-nowrap">
          <div>
            <N mono className="text-chalk font-semibold text-[15px]">{fmt(tot.protein, 1)}</N> {g}
          </div>
          <div>
            <N mono>{fmt(tot.kcal, 0)}</N> {t('nutrition.kcalUnit')}
          </div>
        </div>
      </div>
      <ul className="px-4 pt-1.5 pb-1 flex flex-col">
        {chosen.map((it, i) => {
          const swaps = items[i].alts?.length || 0
          const swapped = (picks[i] || 0) > 0
          return (
            <li key={i} className="flex items-center justify-between gap-2 min-h-[40px]">
              <div className="min-w-0 flex-1">
                <span dir="auto" className={`block truncate text-[13px] leading-[18px] text-start ${swapped ? 'text-chalk' : 'text-chalkdim'}`}>
                  {logName(it, lang)}
                  {it.grams != null && (
                    <span className="text-chalkdim">
                      {' · '}
                      <AmountText row={it} />
                    </span>
                  )}
                </span>
              </div>
              {swaps > 0 && (
                <button
                  type="button"
                  onClick={() => cycle(i)}
                  aria-label={t('nutrition.swapFood', { name: logName(it, lang) })}
                  className="min-h-[40px] -me-2 px-2 inline-flex items-center gap-1 rounded-full text-xs text-chalkdim hover:text-chalk press shrink-0"
                >
                  <Repeat size={14} aria-hidden="true" />
                  {swapped ? <N mono>{`${picks[i]}/${swaps}`}</N> : t('nutrition.swap')}
                </button>
              )}
            </li>
          )
        })}
      </ul>
      <div className="px-3 pb-3">
        <Button variant="ghost" className="w-full min-h-[44px]" disabled={busy || !chosen.length} onClick={log}>
          <Plus size={16} /> {t('nutrition.logThis')}
        </Button>
      </div>
    </section>
  )
}

// A slot where a coach option was logged today: a quiet line in place of
// the options, so the planned meal reads as done.
export function CoachMealDone({ name }) {
  const { t } = useLanguage()
  return (
    <p className="text-chalkdim text-[13px] flex items-center gap-1.5 -mt-1">
      <Check size={14} className="text-good shrink-0" aria-hidden="true" />
      <span className="truncate">
        {t('nutrition.coachMealLogged')} <bdi>{name}</bdi>
      </span>
    </p>
  )
}

// ------------------------------------------------------------ coach library
// Coach only: options already given to other trainees, to copy to this one.

export function CoachLibraryView({ uid, meal, setMeal, onBack, onClose }) {
  const { t, lang } = useLanguage()
  const { toast } = useFeedback()
  const [list, setList] = useState(null)
  const [error, setError] = useState('')
  const [done, setDone] = useState({})
  const g = t('nutrition.g')

  useEffect(() => {
    getCoachLibrary(uid)
      .then(setList)
      .catch((err) => {
        console.error(err)
        setList([])
        setError(friendlyError(err, t, 'nutrition.loadFailed'))
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid])

  async function add(m) {
    try {
      await copyCoachMeal(uid, m, meal)
      setDone((d) => ({ ...d, [m.id]: true }))
      toast(t('nutrition.coachOptionAdded', { meal: mealLabel(t, meal) }))
    } catch (err) {
      console.error(err)
      toast(friendlyError(err, t), 'error')
    }
  }

  return (
    <>
      <SheetHeader title={t('nutrition.coachLibraryTitle')} onBack={onBack} onClose={onClose} />
      <div className="px-4 pt-2 shrink-0">
        <MealTabs value={meal} onChange={setMeal} />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] pt-3 flex flex-col gap-2">
        <p className="text-chalkdim text-sm">{t('nutrition.coachLibraryHint')}</p>
        {error && <p className="text-sm" role="alert">{error}</p>}
        {list === null && !error && <p className="eyebrow animate-pulse py-2">{t('common.loading')}</p>}
        {list && list.length === 0 && !error && <p className="text-chalkdim text-sm">{t('nutrition.coachLibraryEmpty')}</p>}
        {(list || []).map((m) => {
          const items = Array.isArray(m.items) ? m.items : []
          const tot = sumLogs(items)
          return (
            <div key={m.id} className="card flex items-center gap-3 px-4 py-2 min-h-[64px]">
              <div className="min-w-0 flex-1">
                <span dir="auto" className="block truncate text-[15px] font-medium text-start">{m.name}</span>
                <span dir="auto" className="block truncate text-chalkdim text-[13px] text-start">{items.map((it) => logName(it, lang)).join(', ')}</span>
                <span className="block text-chalkdim text-xs">
                  {m.meal ? `${mealLabel(t, m.meal)} · ` : ''}
                  <N mono>{fmt(tot.protein, 1)}</N> {g} · <N mono>{fmt(tot.kcal, 0)}</N> {t('nutrition.kcalUnit')}
                </span>
              </div>
              <Button variant="ghost" className="shrink-0 min-h-[44px] px-3" disabled={!!done[m.id]} onClick={() => add(m)} aria-label={t('nutrition.addCoachOption', { name: m.name, meal: mealLabel(t, meal) })}>
                {done[m.id] ? <Check size={18} /> : <Plus size={18} />}
              </Button>
            </div>
          )
        })}
      </div>
    </>
  )
}
