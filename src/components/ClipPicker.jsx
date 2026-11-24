import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search, X, Ban, Sparkles } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useScrollLock } from '../lib/scrollLock.js'
import { CLIP_SLUGS, NO_CLIP, autoClipFor, clipLabel, exerciseClipFor, suggestClipsFor } from '../lib/exerciseClips.js'
import { useGlobalExercises } from '../lib/db.js'
import ExerciseThumb from './ExerciseThumb.jsx'

// "Demo clip" in the exercise editor: shows the clip this exercise will get
// (tap the picture to play it) and lets the coach pick another one, or none.
//   value  '' (automatic), a clip slug, or NO_CLIP
export function ClipField({ value, onChange, names, label }) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const auto = autoClipFor(names)
  const current = exerciseClipFor(value, names)
  const text = value === NO_CLIP
    ? t('clips.none')
    : value
      ? clipLabel(value)
      : auto
        ? t('clips.autoFound', { name: clipLabel(auto.slug) })
        : t('clips.autoNone')

  return (
    <div className="flex items-center gap-3">
      <ExerciseThumb size={52} chosen={value} names={names} label={label || (current && clipLabel(current.slug))} />
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex-1 min-w-0 min-h-[52px] px-3 rounded-[12px] bg-surface2 hover:bg-line text-start flex items-center justify-between gap-2"
      >
        <span className="min-w-0 truncate text-sm">{text}</span>
        <ChevronDown size={16} className="shrink-0 text-chalkdim" aria-hidden="true" />
      </button>
      {open && (
        <ClipPickerModal
          value={value}
          auto={auto}
          onClose={() => setOpen(false)}
          onPick={(v) => {
            onChange(v)
            setOpen(false)
          }}
        />
      )}
    </div>
  )
}

function ClipPickerModal({ value, auto, onPick, onClose, required = false }) {
  const { t } = useLanguage()
  useScrollLock(true)
  const [q, setQ] = useState('')

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const shown = useMemo(() => {
    const words = q.toLowerCase().replace(/-/g, ' ').split(/\s+/).filter(Boolean)
    return CLIP_SLUGS.filter((s) => words.every((w) => s.replace(/-/g, ' ').includes(w)))
  }, [q])

  const option = (selected) =>
    `flex items-center gap-2 min-h-[44px] px-3 rounded-full text-sm ${selected ? 'bg-chalk text-ink' : 'bg-surface2 text-chalk hover:bg-line'}`

  return createPortal(
    <div
      className="fixed inset-0 z-40 bg-ink/80 backdrop-blur-sm flex items-center justify-center p-4"
      style={{ paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))', paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t('clips.choose')}
    >
      <div className="card p-4 w-full max-w-lg max-h-full flex flex-col gap-3 animate-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{t('clips.choose')}</h2>
          <button
            type="button"
            className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] -me-2 rounded-full hover:bg-surface2 text-chalkdim hover:text-chalk"
            onClick={onClose}
            title={t('common.close')}
            aria-label={t('common.close')}
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex gap-2 flex-wrap">
          {!required && (
            <button type="button" className={option(!value)} onClick={() => onPick('')}>
              <Sparkles size={15} aria-hidden="true" />
              {auto ? t('clips.autoFound', { name: clipLabel(auto.slug) }) : t('clips.auto')}
            </button>
          )}
          <button type="button" className={option(value === NO_CLIP)} onClick={() => onPick(NO_CLIP)}>
            <Ban size={15} aria-hidden="true" />
            {t('clips.none')}
          </button>
        </div>

        <label className="relative block">
          <Search size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-chalkdim pointer-events-none" aria-hidden="true" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('clips.search')}
            aria-label={t('clips.search')}
            dir="ltr"
            className="w-full !ps-9"
          />
        </label>

        <div className="flex-1 overflow-y-auto -mx-1 px-1 min-h-[200px]">
          {shown.length === 0 ? (
            <p className="text-chalkdim text-sm py-4">{t('clips.noResults')}</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 pb-1">
              {shown.map((slug) => {
                const on = value === slug
                const clip = exerciseClipFor(slug, [])
                return (
                  <button
                    key={slug}
                    type="button"
                    onClick={() => onPick(slug)}
                    aria-pressed={on}
                    className={`press flex flex-col gap-1.5 p-1.5 rounded-[14px] text-start ${on ? 'bg-accentsoft ring-2 ring-accent' : 'hover:bg-surface2'}`}
                  >
                    <span className="relative block w-full aspect-square rounded-[10px] overflow-hidden bg-white">
                      <img src={clip.still} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                      {on && (
                        <span className="absolute top-1 end-1 w-6 h-6 rounded-full bg-accent text-onaccent flex items-center justify-center">
                          <Check size={14} strokeWidth={3} />
                        </span>
                      )}
                    </span>
                    <span className="text-xs leading-4 text-chalk line-clamp-2">
                      <bdi>{clipLabel(slug)}</bdi>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

// "Demo clip" when a trainee creates their own exercise: they must choose.
// Clips that look like the name they typed come first, then "browse all",
// and "No clip" for exercises we have no clip for.
//   value  '' (not chosen yet), a clip slug, or NO_CLIP
export function ClipChooser({ value, onChange, name, nameHe, label, error }) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [catalogue] = useGlobalExercises()
  const typed = [name, nameHe].map((n) => String(n || '').trim()).filter(Boolean).join(' ')
  const suggestions = useMemo(() => suggestClipsFor([name, nameHe], catalogue || [], 4), [name, nameHe, catalogue])
  const chosen = value && value !== NO_CLIP ? exerciseClipFor(value, []) : null

  const chip = (selected) =>
    `flex items-center gap-2 min-h-[44px] px-3 rounded-full text-sm ${selected ? 'bg-chalk text-ink' : 'bg-surface2 text-chalk hover:bg-line'}`

  return (
    <div className="flex flex-col gap-2.5" data-testid="clip-chooser">
      {chosen && (
        <div className="flex items-center gap-3">
          <ExerciseThumb size={52} chosen={value} names={[]} label={label || clipLabel(chosen.slug)} />
          <span className="min-w-0 text-sm"><bdi>{clipLabel(chosen.slug)}</bdi></span>
        </div>
      )}
      {!typed && !value && <p className="text-chalkdim text-sm">{t('clips.typeNameFirst')}</p>}
      {typed && suggestions.length > 0 && (
        <>
          <p className="text-chalkdim text-xs">{t('clips.suggested')}</p>
          <div className="grid grid-cols-4 gap-2">
            {suggestions.map((c) => {
              const on = value === c.slug
              return (
                <button
                  key={c.slug}
                  type="button"
                  onClick={() => onChange(c.slug)}
                  aria-pressed={on}
                  className={`press flex flex-col gap-1 p-1 rounded-[12px] text-start ${on ? 'bg-accentsoft ring-2 ring-accent' : 'hover:bg-surface2'}`}
                >
                  <span className="block w-full aspect-square rounded-[9px] overflow-hidden bg-white">
                    <img src={c.still} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                  </span>
                  <span className="text-[11px] leading-[14px] text-chalk line-clamp-2"><bdi>{clipLabel(c.slug)}</bdi></span>
                </button>
              )
            })}
          </div>
        </>
      )}
      {typed && suggestions.length === 0 && <p className="text-chalkdim text-sm">{t('clips.noSuggestion')}</p>}
      <div className="flex gap-2 flex-wrap">
        <button type="button" className={chip(false)} onClick={() => setOpen(true)}>
          <Search size={15} aria-hidden="true" />
          {t('clips.browseAll')}
        </button>
        <button type="button" className={chip(value === NO_CLIP)} onClick={() => onChange(NO_CLIP)} aria-pressed={value === NO_CLIP}>
          <Ban size={15} aria-hidden="true" />
          {t('clips.none')}
        </button>
      </div>
      {error && !value && <p className="text-sm text-iron" role="alert">{t('clips.mustChoose')}</p>}
      {open && (
        <ClipPickerModal
          value={value}
          auto={null}
          required
          onClose={() => setOpen(false)}
          onPick={(v) => {
            onChange(v)
            setOpen(false)
          }}
        />
      )}
    </div>
  )
}
