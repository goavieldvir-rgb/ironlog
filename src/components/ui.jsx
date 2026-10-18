import React from 'react'
import { useLanguage } from '../context/LanguageContext.jsx'

export function Button({ children, variant = 'primary', className = '', ...props }) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-[14px] px-4 py-2 min-h-[44px] text-[15px] font-semibold transition-colors press disabled:opacity-40 disabled:pointer-events-none'
  const variants = {
    primary: 'bg-accent text-ink hover:bg-accent/90',
    save: 'bg-goodbtn text-chalk hover:bg-goodbtn/90',
    brass: 'bg-accent text-ink hover:bg-accent/90',
    ghost: 'bg-surface2 text-chalk hover:bg-surface2/70',
    subtle: 'bg-surface2 text-chalk hover:bg-surface2/70',
    danger: 'bg-transparent text-irontext hover:bg-ironsoft',
  }
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  )
}

export function Card({ children, className = '' }) {
  return <div className={`card p-4 ${className}`}>{children}</div>
}

// Unread coach feedback on a workout row.
export function FeedbackDot({ label }) {
  return <span role="img" aria-label={label} title={label} className="inline-block w-2 h-2 rounded-full bg-accent me-2 align-middle -mt-0.5" />
}

export function Badge({ children, tone = 'default' }) {
  const tones = {
    default: 'bg-surface2 text-chalkdim',
    brass: 'bg-surface2 text-chalkdim',
    iron: 'bg-surface2 text-chalkdim',
    cardio: 'bg-surface2 text-chalkdim',
    good: 'bg-good/10 text-good',
  }
  return (
    <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${tones[tone]}`}>
      {children}
    </span>
  )
}

export function CategoryTag({ category }) {
  const { t } = useLanguage()
  if (category === 'mobility') return <Badge tone="brass">{t('tabs.mobility')}</Badge>
  if (category === 'cardio') return <Badge tone="cardio">{t('tabs.cardio')}</Badge>
  return <Badge tone="iron">{t('tabs.strength')}</Badge>
}

export function EmptyState({ title, body, action }) {
  return (
    <div className="card p-10 text-center flex flex-col items-center gap-3">
      <h2 className="text-xl text-chalk">{title}</h2>
      <p className="text-chalkdim text-sm max-w-sm">{body}</p>
      {action}
    </div>
  )
}

export function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="eyebrow">{label}</span>
      {children}
    </label>
  )
}

// Shown instead of the empty state when a load failed and there's nothing
// cached to show — a bad connection must not look like lost data.
export function LoadError({ onRetry }) {
  const { t } = useLanguage()
  return (
    <div role="alert" className="card p-8 text-center flex flex-col items-center gap-3">
      <p className="text-chalk text-sm max-w-sm">{t('common.loadFailedTitle')}</p>
      <Button type="button" variant="brass" onClick={onRetry}>
        {t('common.tryAgain')}
      </Button>
    </div>
  )
}
