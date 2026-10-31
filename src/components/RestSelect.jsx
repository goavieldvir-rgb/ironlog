import React from 'react'
import { Timer } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext.jsx'
import { REST_CHOICES, cleanRest, formatRest } from '../lib/rest.js'

// Picks a rest length for one exercise. Empty means "use the default", whose
// wording (`emptyLabel`) depends on where this sits.
export default function RestSelect({ value, onChange, emptyLabel, className = '', compact = false }) {
  const { t } = useLanguage()
  const current = cleanRest(value)
  const choices = current != null && !REST_CHOICES.includes(current) ? [...REST_CHOICES, current].sort((a, b) => a - b) : REST_CHOICES
  const select = (
    <select
      value={current ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      aria-label={t('rest.label')}
      title={t('rest.label')}
      className={className}
    >
      <option value="">{emptyLabel}</option>
      {choices.map((s) => (
        <option key={s} value={s}>
          {formatRest(s)}
        </option>
      ))}
    </select>
  )
  if (!compact) return select
  return (
    <span className="inline-flex items-center gap-1 text-chalkdim">
      <Timer size={14} aria-hidden="true" />
      {select}
    </span>
  )
}
