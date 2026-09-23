import React, { useMemo, useRef, useState } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext.jsx'

// A dropdown for picking one of YOUR OWN exercises, with a search box.
// A plain <select> is fine with a dozen options and miserable with a
// hundred — which is what an established account actually has.
//
// The list expands inline rather than floating over the page, so it can't
// get clipped or mispositioned inside a modal (the swap dialog) or on a
// small screen.
export default function ExerciseSelect({ value, onChange, options, placeholder, className = '' }) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const inputRef = useRef(null)

  const selected = options.find((o) => o.id === value)
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return options
    return options.filter((o) => o.label.toLowerCase().includes(needle))
  }, [options, q])

  function choose(id) {
    onChange(id)
    setQ('')
    setOpen(false)
  }

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v)
          setTimeout(() => inputRef.current?.focus(), 0)
        }}
        className="w-full rounded-md border border-line bg-surface2 px-3 py-2 text-sm text-start flex items-center justify-between gap-2"
      >
        <span className={`truncate ${selected ? 'text-chalk' : 'text-chalkdim'}`}>{selected ? selected.label : placeholder}</span>
        <span className="flex items-center gap-1 shrink-0">
          {selected && (
            <X
              size={14}
              className="text-chalkdim hover:text-iron"
              onClick={(e) => {
                e.stopPropagation()
                choose('')
              }}
            />
          )}
          <ChevronDown size={15} className={`text-chalkdim transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && (
        <div className="rounded-md border border-line bg-surface2 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-line">
            <Search size={14} className="text-chalkdim shrink-0" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('common.searchExercises')}
              className="!border-0 !bg-transparent !px-0 !py-0 text-sm w-full"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 && <p className="text-chalkdim text-sm px-3 py-3">{t('common.noMatches')}</p>}
            {filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => choose(o.id)}
                className={`w-full text-start px-3 py-2 text-sm hover:bg-ink ${o.id === value ? 'text-brass' : 'text-chalk'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
