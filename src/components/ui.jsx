import React from 'react'

export function Button({ children, variant = 'primary', className = '', ...props }) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none'
  const variants = {
    primary: 'bg-iron text-chalk hover:bg-iron/90',
    brass: 'bg-brass text-ink hover:bg-brass/90',
    ghost: 'bg-transparent text-chalk hover:bg-surface2 border border-line',
    subtle: 'bg-surface2 text-chalk hover:bg-surface2/70',
    danger: 'bg-transparent text-iron hover:bg-ironsoft border border-ironsoft',
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

export function Badge({ children, tone = 'default' }) {
  const tones = {
    default: 'bg-surface2 text-chalkdim',
    brass: 'bg-brasssoft text-brass',
    iron: 'bg-ironsoft text-iron',
    cardio: 'bg-cardiosoft text-cardio',
    good: 'bg-good/10 text-good',
  }
  return (
    <span className={`eyebrow rounded px-1.5 py-0.5 normal-case font-medium ${tones[tone]}`}>
      {children}
    </span>
  )
}

export function CategoryTag({ category }) {
  if (category === 'mobility') return <Badge tone="brass">Mobility</Badge>
  if (category === 'cardio') return <Badge tone="cardio">Cardio</Badge>
  return <Badge tone="iron">Strength</Badge>
}

export function EmptyState({ title, body, action }) {
  return (
    <div className="card p-10 text-center flex flex-col items-center gap-3">
      <h3 className="text-xl text-chalk">{title}</h3>
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
