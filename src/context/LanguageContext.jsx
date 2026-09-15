import React, { createContext, useContext, useEffect, useState } from 'react'
import { translations } from '../i18n/translations.js'

const LanguageContext = createContext(null)

function getInitialLang() {
  try {
    const saved = localStorage.getItem('ironlog:lang')
    if (saved === 'en' || saved === 'he') return saved
  } catch {
    // ignore — storage might be unavailable
  }
  return 'en'
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(getInitialLang)

  // Sets the actual HTML dir/lang attributes, which is what makes native
  // browser RTL behavior (flex/grid direction, logical start/end CSS
  // properties, etc.) kick in automatically across the whole app.
  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr'
    try {
      localStorage.setItem('ironlog:lang', lang)
    } catch {
      // ignore
    }
  }, [lang])

  function setLang(next) {
    setLangState(next)
  }

  // t('nav.dashboard') walks the nested translations object for the
  // current language. Falls back to English, then to the raw key itself,
  // so a not-yet-translated string never renders as a blank.
  function t(key) {
    const parts = key.split('.')
    let node = translations[lang]
    for (const p of parts) node = node?.[p]
    if (node != null) return node

    let fallback = translations.en
    for (const p of parts) fallback = fallback?.[p]
    return fallback ?? key
  }

  const value = { lang, setLang, dir: lang === 'he' ? 'rtl' : 'ltr', t }

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider')
  return ctx
}
