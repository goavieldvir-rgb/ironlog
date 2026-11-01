import { useEffect, useRef } from 'react'

// Shared dialog behaviour: Escape closes, focus moves in when it opens, Tab
// stays inside, and focus goes back to whatever opened it.
//
//   const ref = useRef(null)
//   const dialogProps = useDialog(open, () => setOpen(false), ref)
//   <div ref={ref} {...dialogProps} aria-label="…">…</div>
//
// `ref` is the dialog's own element (not the backdrop). Give it an
// aria-label or aria-labelledby. Mark an element with `data-autofocus` to
// choose what gets focus first; otherwise it is the first control inside.
const SELECTOR = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

// Dialogs can stack (a "?" inside another dialog): only the top one reacts
// to Escape and Tab.
const stack = []

export function useDialog(open, onClose, ref) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    const token = {}
    stack.push(token)
    const opener = document.activeElement
    const node = ref.current
    const items = () => (node ? [...node.querySelectorAll(SELECTOR)].filter((el) => el.offsetParent !== null || el === document.activeElement) : [])
    if (node && !node.contains(document.activeElement)) {
      const first = node.querySelector('[data-autofocus]') || items()[0] || node
      first.focus({ preventScroll: true })
    }
    const onKey = (e) => {
      if (stack[stack.length - 1] !== token) return
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current?.()
        return
      }
      if (e.key !== 'Tab' || !node) return
      const list = items()
      if (!list.length) {
        e.preventDefault()
        return
      }
      const first = list[0]
      const last = list[list.length - 1]
      if (e.shiftKey && (document.activeElement === first || !node.contains(document.activeElement))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (document.activeElement === last || !node.contains(document.activeElement))) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      const i = stack.indexOf(token)
      if (i >= 0) stack.splice(i, 1)
      if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus({ preventScroll: true })
    }
  }, [open, ref])

  return { role: 'dialog', 'aria-modal': true, tabIndex: -1 }
}
