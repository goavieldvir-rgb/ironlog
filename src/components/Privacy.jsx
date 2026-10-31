import React from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext.jsx'
import { privacy } from '../legal/privacy.js'
import { terms } from '../legal/terms.js'
import { Card } from './ui.jsx'

// The notice itself, shared with the consent screen.
// `level` is the heading level of each section: one below the heading above it.
export function PrivacySections({ doc, level = 2 }) {
  const H = `h${level}`
  return (
    <div className="flex flex-col gap-4">
      {doc.sections.map((s) => (
        <div key={s.heading}>
          <H className="text-base mb-1">{s.heading}</H>
          <p className="text-chalkdim text-sm leading-relaxed whitespace-pre-line">{s.body}</p>
        </div>
      ))}
    </div>
  )
}

// Privacy notice plus the terms people accepted, so they can reread both
// at any time. Also reachable signed out (standalone), from the login screen.
export default function Privacy({ standalone = false }) {
  const { t, lang } = useLanguage()
  const doc = privacy[lang] || privacy.en
  const termsDocs = terms[lang] || terms.en
  const termsDoc = termsDocs.adult
  const minorDoc = termsDocs.minor

  const page = (
    <div className="flex flex-col gap-5 max-w-2xl">
      <div>
        <div className="eyebrow mb-1">{doc.updated}</div>
        <h1 className="text-3xl">{doc.title}</h1>
      </div>

      <Card>
        <PrivacySections doc={doc} />
      </Card>

      <div>
        <h2 className="text-3xl">{t('privacy.termsHeading')}</h2>
        <p className="text-chalkdim text-sm mt-1">{termsDoc.intro}</p>
      </div>

      <Card>
        <PrivacySections doc={termsDoc} level={3} />
      </Card>

      <div>
        <h3 className="text-xl">{t('privacy.minorTermsHeading')}</h3>
        <p className="text-chalkdim text-sm mt-1">{minorDoc.intro}</p>
      </div>

      <Card>
        <PrivacySections doc={minorDoc} level={4} />
      </Card>
    </div>
  )

  if (!standalone) return page

  return (
    <div className="min-h-dvh bg-ink px-4 pb-8 flex justify-center" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 2rem)' }}>
      <div className="w-full max-w-2xl flex flex-col gap-4">
        <Link to="/" className="text-chalkdim text-xs hover:text-chalk w-fit inline-flex items-center min-h-[44px]">
          {t('privacy.back')}
        </Link>
        {page}
      </div>
    </div>
  )
}
