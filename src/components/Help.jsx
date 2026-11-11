import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronDown, HelpCircle, Sparkles } from 'lucide-react'
import { ForwardChevron } from './DirectionalIcon.jsx'
import { useAdmin } from '../context/AdminContext.jsx'
import { Card } from './ui.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import InstallGuide from './InstallGuide.jsx'

export default function Help() {
  const { t } = useLanguage()
  const [openIndex, setOpenIndex] = useState(0)
  const navigate = useNavigate()
  const { isAdmin, actingAs } = useAdmin()

  // Finishing (11) follows logging, and reminders (12) and language/privacy
  // (13) sit before the troubleshooting section so that stays last.
  const sections = [1, 2, 3, 4, 5, 11, 6, 7, 8, 9, 12, 13, 10].map((n) => ({
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

      {/* Replays the first-run walkthrough on the home screen. */}
      {!isAdmin && !actingAs && (
        <button
          type="button"
          onClick={() => navigate('/', { state: { tour: true } })}
          className="press-row card !p-4 flex items-center gap-3 text-start hover:bg-surface2"
        >
          <Sparkles size={18} className="text-accent shrink-0" aria-hidden="true" />
          <span className="flex-1 min-w-0">
            <span className="block text-chalk">{t('tour.replay')}</span>
            <span className="block text-chalkdim text-sm">{t('tour.replayBody')}</span>
          </span>
          <ForwardChevron size={16} className="text-chalkdim/70 shrink-0" />
        </button>
      )}

      <InstallGuide />

      <div className="flex flex-col gap-2">
        {sections.map((s, i) => (
          <Card key={i} className="!p-0 overflow-hidden">
            <button
              onClick={() => setOpenIndex(openIndex === i ? -1 : i)}
              id={`help-h${i}`}
              aria-expanded={openIndex === i}
              aria-controls={`help-p${i}`}
              className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-start hover:bg-surface2"
            >
              <span className="text-chalk">{s.title}</span>
              <ChevronDown
                size={16}
                className={`text-chalkdim shrink-0 transition-transform ${openIndex === i ? 'rotate-180' : ''}`}
              />
            </button>
            {openIndex === i && (
              <div id={`help-p${i}`} role="region" aria-labelledby={`help-h${i}`} className="px-4 pb-4 text-chalkdim text-sm leading-relaxed whitespace-pre-line border-t border-line pt-3">
                {s.body}
              </div>
            )}
          </Card>
        ))}
      </div>

      <Link to="/privacy" className="text-chalkdim text-sm hover:text-brass w-fit">
        {t('privacy.link')}
      </Link>
    </div>
  )
}
