import React, { useState } from 'react'
import { HelpCircle } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext.jsx'

// A small "?" that expands a short plain-language explanation right below
// itself, in normal document flow — deliberately NOT a floating/absolute
// positioned tooltip, since those are exactly what caused the mobile
// overflow bugs earlier in this app. Use inside a flex-wrap row so the
// expanded note drops to its own line cleanly.
export function InfoTip({ text }) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-chalkdim hover:text-brass inline-flex align-middle shrink-0"
        aria-label={t('common.whatDoesThisMean')}
      >
        <HelpCircle size={13} />
      </button>
      {open && (
        <span className="w-full basis-full block text-xs normal-case font-body tracking-normal text-chalkdim bg-surface2 rounded-md p-2 mt-0.5">
          {text}
        </span>
      )}
    </>
  )
}
