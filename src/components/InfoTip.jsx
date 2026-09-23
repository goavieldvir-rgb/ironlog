import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { HelpCircle } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useScrollLock } from '../lib/scrollLock.js'

// A small "?" that opens its explanation in a panel rendered at the top
// level of the page, NOT inside whatever contains the "?" itself.
//
// It used to expand in place, which works in a wide row but broke badly
// in a narrow one: inside the set-header grid it became a ~50px column
// and wrapped every single word onto its own line. Since these live in
// table headers, badges and stat cards, there's no container width we can
// rely on — so the panel escapes the layout entirely.
export function InfoTip({ text }) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  useScrollLock(open)

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen(true)
        }}
        className="text-chalkdim hover:text-brass inline-flex align-middle shrink-0"
        aria-label={t('common.whatDoesThisMean')}
      >
        <HelpCircle size={13} />
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 bg-ink/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
            onClick={(e) => {
              e.stopPropagation()
              setOpen(false)
            }}
          >
            <div className="card p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
              <p className="text-sm text-chalk whitespace-pre-line">{text}</p>
              <div className="flex justify-end mt-4">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md px-3.5 py-2 text-sm font-medium bg-surface2 text-chalk hover:bg-line"
                >
                  {t('common.gotIt')}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
