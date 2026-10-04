import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MoreVertical } from 'lucide-react'

// One "more" button that opens a short list of actions. Used where a row
// would otherwise need several small icon buttons side by side, which
// either overflow a phone-width row or leave it mostly empty.
//
// items: [{ key, label, icon, onClick, danger, disabled, hidden }]
export default function OverflowMenu({ label, items }) {
  const [open, setOpen] = useState(false)
  const [up, setUp] = useState(false)
  const wrapRef = useRef(null)
  const menuRef = useRef(null)
  const visible = items.filter((i) => !i.hidden)

  // Open upward when there isn't room below (last set on the screen).
  useLayoutEffect(() => {
    if (!open || !wrapRef.current || !menuRef.current) return
    const r = wrapRef.current.getBoundingClientRect()
    const h = menuRef.current.offsetHeight
    setUp(r.bottom + h + 140 > window.innerHeight && r.top > h + 8)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (visible.length === 0) return null

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="press inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-md text-chalkdim hover:text-chalk hover:bg-surface2"
      >
        <MoreVertical size={18} />
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          className={`absolute end-0 z-30 min-w-[13rem] max-w-[16rem] rounded-md border border-line bg-surface2 py-1 shadow-lg ${
            up ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
          {visible.map((it) => (
            <button
              key={it.key}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              onClick={() => {
                setOpen(false)
                it.onClick()
              }}
              className={`flex w-full items-center gap-2.5 px-3 min-h-[44px] text-start text-sm hover:bg-ink disabled:opacity-40 disabled:pointer-events-none ${
                it.danger ? 'text-irontext' : 'text-chalk'
              }`}
            >
              {it.icon}
              <span className="flex-1">{it.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
