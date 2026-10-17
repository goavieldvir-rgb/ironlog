import React, { useEffect, useState } from 'react'
import { Dumbbell } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext.jsx'
import { splashShowing, holdSplash } from '../lib/splash.js'

// Drawn with the launch screen's own classes (defined in index.html), so a
// wait after launch looks exactly like the launch itself.
export function Loader({ mark = false }) {
  const { t } = useLanguage()
  return (
    <div className="il-loader" role="status" aria-label={t('common.loading')}>
      {mark && (
        <div className="il-mark" aria-hidden="true">
          <Dumbbell size={22} strokeWidth={2.5} />
          Ironlog
        </div>
      )}
      <div className="il-track" />
    </div>
  )
}

// Full-screen wait. While the launch screen is still up it simply keeps it
// there; after that it draws the same screen in place.
export function ScreenLoader() {
  const [covered] = useState(splashShowing)
  useEffect(() => (covered ? holdSplash() : undefined), [covered])
  if (covered) return null
  return (
    <div className="min-h-dvh flex items-center justify-center">
      <Loader mark />
    </div>
  )
}

// A wait inside a page, under the app's own header and navigation.
export function PageLoader() {
  return (
    <div className="min-h-[50dvh] flex items-center justify-center">
      <Loader />
    </div>
  )
}
