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

// The same dumbbell, still and small, beside the name: the sign-in screens'
// header.
export function BrandMark() {
  return (
    <div className="flex items-center gap-2.5" dir="ltr">
      <svg viewBox="0 0 100 48" width="30" height="15" fill="rgb(255 91 58)" aria-hidden="true">
        {PLATES.map(([, x, y, width, height, rx], i) => (
          <rect key={i} x={x} y={y} width={width} height={height} rx={rx} />
        ))}
      </svg>
      <span className="text-[17px] font-semibold tracking-[-0.01em] text-chalk">Ironlog</span>
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

// Skeletons: grey blocks in the shape of the content that is on its way, for
// a page whose layout is known. One look everywhere: surface2 blocks, a slow
// soft pulse (no shimmer), still when the phone asks for reduced motion.
// Nothing shows for the first 300 ms, so a fast load never flashes.
const SKELETON_DELAY_MS = 300

function useShowAfter(ms) {
  const [show, setShow] = useState(ms <= 0)
  useEffect(() => {
    if (ms <= 0) return undefined
    const id = setTimeout(() => setShow(true), ms)
    return () => clearTimeout(id)
  }, [ms])
  return show
}

// One block. Size and shape come from className (h-3 w-1/2 rounded-full ...).
export function Skeleton({ className = '', style }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} style={style} />
}

// Holds its children back for the first 300 ms. For a small placeholder
// inside content that is already on screen.
export function Delayed({ ms = SKELETON_DELAY_MS, children }) {
  return useShowAfter(ms) ? children : null
}

// A page's (or a section's) worth of skeleton blocks. Tells screen readers
// once that it is loading, then fades in after the delay.
export function SkeletonGroup({ children, className = '', delay = SKELETON_DELAY_MS }) {
  const { t } = useLanguage()
  const show = useShowAfter(delay)
  return (
    <div role="status" aria-busy="true" aria-label={t('common.loading')} className={show ? `skeleton-in ${className}` : ''}>
      {show && children}
    </div>
  )
}

// A list row's placeholder: a thumbnail and two lines. The History list uses
// it, and lists shaped like it can too.
export function SkeletonRow({ thumb = 'w-[34px] h-10 rounded-md', className = '' }) {
  return (
    <div className={`flex items-center gap-3.5 ${className}`}>
      {thumb && <Skeleton className={`${thumb} shrink-0`} />}
      <div className="flex-1 flex flex-col gap-2">
        <Skeleton className="h-3.5 w-1/2" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    </div>
  )
}
