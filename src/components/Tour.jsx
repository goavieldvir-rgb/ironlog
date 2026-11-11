import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext.jsx'
import { ForwardChevron } from './DirectionalIcon.jsx'

// A first-run walkthrough: dims the screen, cuts a lit window around one real
// element at a time (marked with data-tour="key"), and shows a short card
// with a Next button. No library: the spotlight is one fixed box whose huge
// shadow is the dimmed backdrop, so it can glide from target to target.
//
// steps: [{ target, eyebrow, title, body }]. A step whose target isn't on
// screen (no weigh-in card today, desktop has no More button) is skipped, so
// the same list works for every account and screen size.

const PAD = 8 // space between the element and the edge of the lit window
const GAP = 14 // space between the lit window and the card
const EDGE = 16 // the card keeps this far from the screen edges

const TOUR_KEY = (uid) => `ironlog:tour:v1:${uid}`

export function tourSeen(uid) {
  try { return localStorage.getItem(TOUR_KEY(uid)) === 'done' } catch { return true }
}

export function markTourSeen(uid) {
  try { localStorage.setItem(TOUR_KEY(uid), 'done') } catch { /* private mode: it shows again next time */ }
}

function findTarget(key) {
  // Phone tab bar and desktop header both carry the key; use the one that's shown.
  for (const el of document.querySelectorAll(`[data-tour="${key}"]`)) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return el
  }
  return null
}

function isFixed(el) {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (getComputedStyle(n).position === 'fixed') return true
  }
  return false
}

export default function Tour({ steps, onClose }) {
  const { t, dir } = useLanguage()
  // Steps are checked once, when the tour opens.
  const [shown] = useState(() => steps.filter((s) => findTarget(s.target)))
  const [i, setI] = useState(0)
  const [rect, setRect] = useState(null)
  const [cardH, setCardH] = useState(180)
  const cardRef = useRef(null)
  const step = shown[i]
  const last = i === shown.length - 1
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  const measure = useCallback(() => {
    const el = step && findTarget(step.target)
    if (!el) return setRect(null)
    const r = el.getBoundingClientRect()
    setRect({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 })
  }, [step])

  // Bring the target on screen, then light it.
  useLayoutEffect(() => {
    const el = step && findTarget(step.target)
    if (!el) return
    if (!isFixed(el)) {
      const r = el.getBoundingClientRect()
      const room = window.innerHeight - cardH - GAP * 2 - 120 // leave space for the card and tab bar
      if (r.top < 24 || r.bottom > room) el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
    }
    measure()
  }, [step, measure, cardH, reduce])

  useEffect(() => {
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [measure])

  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight)
  }, [i, rect?.width])

  // Focus moves into the card so screen readers read the new step and
  // Tab lands on its buttons; the card itself shows no focus ring.
  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true })
  }, [i])

  const finish = useCallback((completed) => onClose?.(completed), [onClose])
  const next = useCallback(() => (last ? finish(true) : setI((n) => n + 1)), [last, finish])
  const back = useCallback(() => setI((n) => Math.max(0, n - 1)), [])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') finish(false)
      // Arrow keys follow reading direction.
      const fwd = dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight'
      const bwd = dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft'
      if (e.key === fwd) next()
      if (e.key === bwd) back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dir, next, back, finish])

  // Nothing to point at (an empty or failed screen): don't show an empty tour.
  useEffect(() => {
    if (shown.length === 0) finish(false)
  }, [shown.length, finish])
  if (!step) return null

  // Card goes below the lit window when it fits, otherwise above it.
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  let cardTop = vh / 2 - cardH / 2
  if (rect) {
    const below = rect.top + rect.height + GAP
    const above = rect.top - GAP - cardH
    cardTop = below + cardH <= vh - EDGE ? below : Math.max(EDGE, above)
  }
  const glide = reduce ? 'none' : 'top 320ms cubic-bezier(.2,.8,.2,1), left 320ms cubic-bezier(.2,.8,.2,1), width 320ms cubic-bezier(.2,.8,.2,1), height 320ms cubic-bezier(.2,.8,.2,1)'
  const radius = rect && rect.height < 90 ? 20 : 26

  return createPortal(
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body">
      {/* Catches taps so the app underneath can't be used mid-tour. */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />
      <div
        aria-hidden="true"
        className="absolute pointer-events-none"
        style={
          rect
            ? {
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
                borderRadius: radius,
                boxShadow: '0 0 0 2px rgb(var(--accent) / 0.55), 0 0 0 200vmax rgba(5,5,6,0.74)',
                transition: glide,
              }
            : { inset: 0, background: 'rgba(5,5,6,0.74)' }
        }
      />
      <div
        ref={cardRef}
        tabIndex={-1}
        className="outline-none absolute inset-x-4 mx-auto max-w-[380px] rounded-[22px] bg-[#1E1E21] p-5 shadow-[inset_0_0.5px_0_rgba(255,255,255,0.12),0_18px_48px_rgba(0,0,0,0.55)]"
        style={{ top: cardTop, transition: reduce ? 'none' : 'top 320ms cubic-bezier(.2,.8,.2,1)' }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="eyebrow !text-accent">{step.eyebrow}</div>
          <button
            type="button"
            onClick={() => finish(false)}
            className="press -mt-2 -me-2 inline-flex items-center gap-1 rounded-full px-3 min-h-9 text-[13px] text-chalkdim hover:text-chalk"
          >
            {t('tour.skip')}
            <X size={14} aria-hidden="true" />
          </button>
        </div>
        <h2 id="tour-title" className="text-[21px] leading-[26px] font-semibold tracking-[-0.01em] mt-1">
          {step.title}
        </h2>
        <p id="tour-body" className="text-[14px] leading-5 text-chalkdim mt-2">
          {step.body}
        </p>
        <div className="flex items-center justify-between gap-3 mt-5">
          <div className="flex items-center gap-1.5" role="img" aria-label={t('tour.stepOf', { n: i + 1, total: shown.length })}>
            {shown.map((_, n) => (
              <span
                key={n}
                className={`h-1.5 rounded-full transition-all duration-300 ${n === i ? 'w-5 bg-accent' : 'w-1.5 bg-white/20'}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-1">
            {i > 0 && (
              <button type="button" onClick={back} className="press rounded-full px-4 min-h-11 text-[14px] text-chalkdim hover:text-chalk">
                {t('tour.back')}
              </button>
            )}
            <button
              type="button"
              onClick={next}
              className="press inline-flex items-center gap-1.5 rounded-full bg-accent text-ink font-semibold px-5 min-h-11 text-[15px] hover:bg-accent/90"
            >
              {last ? t('tour.done') : t('tour.next')}
              {!last && <ForwardChevron size={16} aria-hidden="true" />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
