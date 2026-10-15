import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, X } from 'lucide-react'
import { useLanguage } from './LanguageContext.jsx'
import { useScrollLock } from '../lib/scrollLock.js'

// One place for the two kinds of feedback every screen needs:
//
//   const { confirm, toast } = useFeedback()
//   if (await confirm({ title, body, confirmLabel, danger: true })) { ... }
//   toast(t('feedback.saveFailed'), 'error')
//
// Replaces the browser's native confirm() popup (grey, OS-styled, nothing
// like the rest of the app) and gives failed saves a visible message
// instead of a button that silently un-greys.

const FeedbackContext = createContext(null)

export function FeedbackProvider({ children }) {
  const { t } = useLanguage()
  const [dialog, setDialog] = useState(null)
  useScrollLock(!!dialog)
  const [toasts, setToasts] = useState([])
  const resolverRef = useRef(null)

  const confirm = useCallback((opts) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve
      setDialog(opts)
    })
  }, [])

  function close(result) {
    setDialog(null)
    resolverRef.current?.(result)
    resolverRef.current = null
  }

  useEffect(() => {
    if (!dialog) return
    const onKey = (e) => e.key === 'Escape' && close(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialog])

  const toast = useCallback((message, tone = 'success') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { id, message, tone }])
    // Errors stay up longer — they usually need reading, not just noticing.
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 2800)
  }, [])

  return (
    <FeedbackContext.Provider value={{ confirm, toast }}>
      {children}

      {dialog && (
        <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))', paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }} onClick={() => close(false)}>
          <div className="card p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true">
            <h2 className="text-xl mb-2">{dialog.title}</h2>
            {dialog.body && <p className="text-chalkdim text-sm mb-5 whitespace-pre-line">{dialog.body}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => close(false)}
                autoFocus={!!dialog.danger}
                className="rounded-md px-3.5 py-2 min-h-[44px] text-sm font-medium border border-line text-chalk hover:bg-surface2"
              >
                {dialog.cancelLabel || t('common.cancel')}
              </button>
              <button
                onClick={() => close(true)}
                autoFocus={!dialog.danger}
                className={`rounded-md px-3.5 py-2 min-h-[44px] text-sm font-medium ${
                  dialog.danger ? 'bg-ironbtn text-chalk hover:bg-ironbtn/90' : 'bg-brass text-ink hover:bg-brass/90'
                }`}
              >
                {dialog.confirmLabel || t('feedback.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success: a floating pill at the top of the screen, same raised
          surface as the rest dock, nothing to tap (it never blocks the
          header). Errors stay at the bottom with a close button. */}
      <div
        className="fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4 pointer-events-none"
        style={{ top: 'calc(0.75rem + env(safe-area-inset-top, 0px))' }}
        role="status"
        aria-live="polite"
      >
        {toasts.filter((x) => x.tone !== 'error').map((x) => (
          <div
            key={x.id}
            className="flex items-center gap-2.5 rounded-full bg-[#232326] text-chalk ps-2.5 pe-4 py-2.5 text-[15px] font-semibold max-w-sm shadow-[0_8px_24px_rgba(0,0,0,0.45)] animate-toast motion-reduce:animate-none"
          >
            <span className="grid place-items-center w-7 h-7 rounded-full bg-good/15 text-good shrink-0">
              <Check size={16} strokeWidth={2.75} />
            </span>
            <span>{x.message}</span>
          </div>
        ))}
      </div>

      <div
        className="fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4 pointer-events-none"
        style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
        role="alert"
      >
        {toasts.filter((x) => x.tone === 'error').map((x) => (
          <div key={x.id} className="pointer-events-auto flex items-center gap-2.5 rounded-[20px] bg-[#232326] ps-3 pe-3.5 py-3 text-[15px] max-w-sm w-full shadow-[0_8px_24px_rgba(0,0,0,0.45)] text-chalk animate-sheet motion-reduce:animate-none">
            <AlertTriangle size={18} className="text-irontext shrink-0" />
            <span className="flex-1">{x.message}</span>
            <button onClick={() => setToasts((prev) => prev.filter((y) => y.id !== x.id))} className="text-chalkdim hover:text-chalk" aria-label={t('common.close')}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </FeedbackContext.Provider>
  )
}

export function useFeedback() {
  const ctx = useContext(FeedbackContext)
  if (!ctx) throw new Error('useFeedback must be used inside FeedbackProvider')
  return ctx
}
