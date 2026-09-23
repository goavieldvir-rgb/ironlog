import { useEffect } from 'react'

// Stops the page behind an open dialog or menu from scrolling when you
// drag on it. Simply hiding overflow isn't enough on iPhone, where Safari
// scrolls the page anyway — pinning the body in place is what actually
// works, and the scroll position has to be restored afterwards or the
// page jumps to the top when the dialog closes.
//
// A counter, not a boolean, because overlays stack: tapping a "?" inside
// the swap dialog means two locks are active, and only the last one to
// close should restore scrolling.
let locks = 0
let savedY = 0
let savedStyles = null

function lock() {
  locks += 1
  if (locks > 1) return
  savedY = window.scrollY
  const b = document.body
  savedStyles = { position: b.style.position, top: b.style.top, width: b.style.width, overflow: b.style.overflow }
  b.style.position = 'fixed'
  b.style.top = `-${savedY}px`
  b.style.width = '100%'
  b.style.overflow = 'hidden'
}

function unlock() {
  locks = Math.max(0, locks - 1)
  if (locks > 0 || !savedStyles) return
  const b = document.body
  b.style.position = savedStyles.position
  b.style.top = savedStyles.top
  b.style.width = savedStyles.width
  b.style.overflow = savedStyles.overflow
  savedStyles = null
  window.scrollTo(0, savedY)
}

export function useScrollLock(active) {
  useEffect(() => {
    if (!active) return
    lock()
    return unlock
  }, [active])
}
