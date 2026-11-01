import React, { useEffect, useRef } from 'react'

// A photo you can pinch, drag, double-tap and scroll-wheel to zoom. The zoom
// is controlled by the parent ({ s, x, y }: scale and offset from the centre,
// in screen pixels), so two panes can share one zoom and move together.
// `smooth` on a view animates to it (buttons, double-tap); gestures follow
// the fingers directly.
export const MAX_ZOOM = 5
export const UNZOOMED = { s: 1, x: 0, y: 0, smooth: true }

function clampView(v, w, h) {
  const s = Math.min(MAX_ZOOM, Math.max(1, v.s))
  const mx = ((s - 1) * w) / 2
  const my = ((s - 1) * h) / 2
  return { s, x: Math.min(mx, Math.max(-mx, v.x)), y: Math.min(my, Math.max(-my, v.y)), smooth: v.smooth }
}

// Zooms by `k`, keeping the point (px, py) (from the centre) where it is.
export function zoomAt(v, k, px, py, w, h, smooth = false) {
  const s = Math.min(MAX_ZOOM, Math.max(1, v.s * k))
  const r = s / v.s
  return clampView({ s, x: px - (px - v.x) * r, y: py - (py - v.y) * r, smooth }, w, h)
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

export default function ZoomPane({ src, alt, view, onView, onSwipe, loading, children }) {
  const box = useRef(null)
  const pointers = useRef(new Map())
  const gesture = useRef(null)
  const lastTap = useRef(null)
  const viewRef = useRef(view)
  viewRef.current = view
  const onViewRef = useRef(onView)
  onViewRef.current = onView

  function local(e) {
    const r = box.current.getBoundingClientRect()
    return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2, w: r.width, h: r.height }
  }

  function startGesture() {
    const pts = [...pointers.current.values()]
    const v = viewRef.current
    if (pts.length >= 2) {
      gesture.current = { kind: 'pinch', v0: v, d0: dist(pts[0], pts[1]) || 1, m0: mid(pts[0], pts[1]), moved: true }
    } else if (pts.length === 1) {
      gesture.current = { kind: 'pan', v0: v, p0: pts[0], t0: Date.now(), moved: gesture.current != null }
    } else {
      gesture.current = null
    }
  }

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    try {
      box.current.setPointerCapture(e.pointerId)
    } catch {
      // not a live pointer (synthetic event); the gesture still works
    }
    pointers.current.set(e.pointerId, local(e))
    startGesture()
  }

  function onPointerMove(e) {
    if (!pointers.current.has(e.pointerId)) return
    const p = local(e)
    pointers.current.set(e.pointerId, p)
    const g = gesture.current
    if (!g) return
    if (g.kind === 'pinch') {
      const pts = [...pointers.current.values()]
      if (pts.length < 2) return
      const m = mid(pts[0], pts[1])
      const s = Math.min(MAX_ZOOM, Math.max(1, (g.v0.s * dist(pts[0], pts[1])) / g.d0))
      const cx = (g.m0.x - g.v0.x) / g.v0.s
      const cy = (g.m0.y - g.v0.y) / g.v0.s
      onViewRef.current(clampView({ s, x: m.x - cx * s, y: m.y - cy * s, smooth: false }, p.w, p.h))
    } else {
      const dx = p.x - g.p0.x
      const dy = p.y - g.p0.y
      if (Math.hypot(dx, dy) > 8) g.moved = true
      if (g.v0.s > 1) onViewRef.current(clampView({ s: g.v0.s, x: g.v0.x + dx, y: g.v0.y + dy, smooth: false }, p.w, p.h))
    }
  }

  function onPointerUp(e) {
    if (!pointers.current.has(e.pointerId)) return
    const p = local(e)
    pointers.current.delete(e.pointerId)
    const g = gesture.current
    if (g?.kind === 'pan' && pointers.current.size === 0) {
      const dx = p.x - g.p0.x
      const dy = p.y - g.p0.y
      if (!g.moved && Date.now() - g.t0 < 300) {
        const prev = lastTap.current
        if (prev && Date.now() - prev.t < 320 && Math.hypot(p.x - prev.x, p.y - prev.y) < 30) {
          lastTap.current = null
          const v = viewRef.current
          onViewRef.current(v.s > 1 ? UNZOOMED : zoomAt(v, 2.5, p.x, p.y, p.w, p.h, true))
        } else {
          lastTap.current = { t: Date.now(), x: p.x, y: p.y }
        }
      } else if (g.v0.s === 1 && onSwipe && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        onSwipe(dx < 0 ? 'left' : 'right')
      }
    }
    startGesture()
  }

  // React listens to wheel passively, which can't stop the page scrolling.
  useEffect(() => {
    const el = box.current
    const onWheel = (e) => {
      e.preventDefault()
      const p = local(e)
      onViewRef.current(zoomAt(viewRef.current, Math.exp(-e.deltaY * 0.002), p.x, p.y, p.w, p.h))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  return (
    <div
      ref={box}
      className="relative w-full h-full overflow-hidden select-none"
      style={{ touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {src && (
        <img
          src={src}
          alt={alt}
          draggable={false}
          className={`absolute inset-0 w-full h-full object-contain pointer-events-none ${view.smooth ? 'transition-transform duration-200 ease-out' : ''}`}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}
        />
      )}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="w-8 h-8 rounded-full border-2 border-chalk/30 border-t-chalk animate-spin" />
        </div>
      )}
      {children}
    </div>
  )
}
