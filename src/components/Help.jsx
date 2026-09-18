import React, { useState } from 'react'
import { ChevronDown, HelpCircle } from 'lucide-react'
import { Card } from './ui.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'

export default function Help() {
  const { t } = useLanguage()
  const [openIndex, setOpenIndex] = useState(0)

  const sections = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({
    title: t(`help.s${n}title`),
    body: t(`help.s${n}body`),
  }))

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <div>
        <div className="eyebrow mb-1 flex items-center gap-1.5">
          <HelpCircle size={13} /> {t('help.eyebrow')}
        </div>
        <h1 className="text-3xl">{t('help.title')}</h1>
        <p className="text-chalkdim text-sm mt-1">{t('help.subtitle')}</p>
      </div>

      <div className="flex flex-col gap-2">
        {sections.map((s, i) => (
          <Card key={i} className="!p-0 overflow-hidden">
            <button
              onClick={() => setOpenIndex(openIndex === i ? -1 : i)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-start hover:bg-surface2"
            >
              <span className="text-chalk">{s.title}</span>
              <ChevronDown
                size={16}
                className={`text-chalkdim shrink-0 transition-transform ${openIndex === i ? 'rotate-180' : ''}`}
              />
            </button>
            {openIndex === i && (
              <div className="px-4 pb-4 text-chalkdim text-sm leading-relaxed whitespace-pre-line border-t border-line pt-3">
                {s.body}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}
