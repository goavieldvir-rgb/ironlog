import React, { useEffect, useState } from 'react'
import { useLanguage } from '../context/LanguageContext.jsx'
import { splashShowing, holdSplash } from '../lib/splash.js'

// Drawn with the launch screen's own classes (defined in index.html), so a
// wait after launch looks exactly like the launch itself. Keep the shapes in
// step with the copy in index.html.
const PLATES = [
  ['il-bar', 22, 21.5, 56, 5, 2.5],
  ['il-plate-in', 15, 7, 9, 34, 3],
  ['il-plate-in', 76, 7, 9, 34, 3],
  ['il-plate-out', 7, 13, 6, 22, 3],
  ['il-plate-out', 87, 13, 6, 22, 3],
]

function Mark() {
  const shapes = PLATES.map(([cls, x, y, width, height, rx], i) => (
    <rect key={i} className={cls} x={x} y={y} width={width} height={height} rx={rx} />
  ))
  return (
    <div className="il-logo" aria-hidden="true">
      <svg viewBox="0 0 100 48" fill="rgb(255 91 58)">
        <defs>
          {/* Its own ids: the launch screen's copy may still be in the page. */}
          <clipPath id="il-clip-app">{shapes}</clipPath>
          <linearGradient id="il-light-app" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
        {shapes}
        <g clipPath="url(#il-clip-app)">
          <rect className="il-sheen" x="0" y="0" width="28" height="48" fill="url(#il-light-app)" />
        </g>
      </svg>
      <div className="il-word">Ironlog</div>
    </div>
  )
}

export function Loader({ mark = false }) {
  const { t } = useLanguage()
  return (
    <div className="il-loader" role="status" aria-label={t('common.loading')}>
      {mark ? <Mark /> : <div className="il-track" />}
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
