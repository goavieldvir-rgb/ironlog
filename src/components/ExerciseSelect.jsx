import React, { useId, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext.jsx'

// A dropdown for picking one of YOUR OWN exercises, with a search box.
// A plain <select> is fine with a dozen options and miserable with a
// hundred — which is what an established account actually has.
//
// The list expands inline rather than floating over the page, so it can't
// get clipped or mispositioned inside a modal (the swap dialog) or on a
// small screen.
//
// `groups` (optional): [{ label, ids }] pins those options under a heading at
// the top (e.g. "Recent"); everything else follows, under `restLabel` if given.
export default function ExerciseSelect({ value, onChange, options, placeholder, className = '', groups, restLabel }) {
  const { t } = useLanguage()
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const inputRef = useRef(null)

  const selected = options.find((o) => o.id === value)
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return options
    return options.filter((o) => o.label.toLowerCase().includes(needle))
  }, [options, q])

  // Sections to render: the pinned groups (in order, only options that match
  // the search), then the rest. Without `groups` it's one unlabelled section.
  const sections = useMemo(() => {
    if (!groups || groups.length === 0) return [{ label: null, items: filtered }]
    const used = new Set()
    const out = []
    for (const g of groups) {
      const ids = new Set(g.ids)
      const items = filtered.filter((o) => ids.has(o.id) && !used.has(o.id))
      items.forEach((o) => used.add(o.id))
      if (items.length) out.push({ label: g.label, items })
    }
    const rest = filtered.filter((o) => !used.has(o.id))
    if (rest.length) out.push({ label: out.length ? restLabel || null : null, items: rest })
    return out
  }, [filtered, groups, restLabel])

  function choose(id) {
    onChange(id)
    setQ('')
    setOpen(false)
  }

  return (
    <div
      className={`flex flex-col gap-1.5 ${className}`}
      onKeyDown={(e) => {
        // Escape closes just the list, not the dialog the list sits in.
        if (e.key === 'Escape' && open) {
          e.stopPropagation()
          setOpen(false)
        }
      }}
    >
      <div className="relative">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          onClick={() => {
            setOpen((v) => !v)
            setTimeout(() => inputRef.current?.focus(), 0)
          }}
          className={`w-full rounded-md border border-line bg-surface2 px-3 py-2 min-h-[44px] text-sm text-start flex items-center justify-between gap-2 ${selected ? 'pe-12' : ''}`}
        >
          <span className={`truncate ${selected ? 'text-chalk' : 'text-chalkdim'}`}>{selected ? selected.label : placeholder}</span>
          <span className="flex items-center gap-1 shrink-0">
            <ChevronDown size={15} className={`text-chalkdim transition-transform ${open ? 'rotate-180' : ''}`} />
          </span>
        </button>
        {selected && (
          <span className="absolute end-9 top-1/2 -translate-y-1/2 inline-flex">
            <button
              type="button"
              title={t('common.clear')}
              aria-label={t('common.clear')}
              className="hit text-chalkdim hover:text-irontext inline-flex"
              onClick={() => choose('')}
            >
              <X size={14} />
            </button>
          </span>
        )}
      </div>

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
          <div id={listId} role="listbox" aria-label={placeholder} className="max-h-56 overflow-y-auto">
            {filtered.length === 0 && <p className="text-chalkdim text-sm px-3 py-3">{t('common.noMatches')}</p>}
            {sections.map((sec, si) => (
              <div key={si} role={sec.label ? 'group' : undefined} aria-label={sec.label || undefined}>
                {sec.label && <p className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide text-chalkdim" aria-hidden="true">{sec.label}</p>}
                {sec.items.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    role="option"
                    aria-selected={o.id === value}
                    onClick={(e) => {
                      // This picker usually sits inside a <label> (Field). Once
                      // the tapped option disappears, the browser treats the tap
                      // as a click on the label and "clicks" the first button in
                      // it — the toggle — so the list popped straight back open.
                      e.preventDefault()
                      choose(o.id)
                    }}
                    className={`press-row w-full text-start px-3 py-2 min-h-[44px] text-sm hover:bg-ink ${o.id === value ? 'text-brass' : 'text-chalk'}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
