import React, { createContext, useCallback, useContext, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, X } from 'lucide-react'
import { useLanguage } from './LanguageContext.jsx'

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
        <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => close(false)}>
          <div className="card p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true">
            <h2 className="text-xl mb-2">{dialog.title}</h2>
            {dialog.body && <p className="text-chalkdim text-sm mb-5 whitespace-pre-line">{dialog.body}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => close(false)}
                className="rounded-md px-3.5 py-2 text-sm font-medium border border-line text-chalk hover:bg-surface2"
              >
                {dialog.cancelLabel || t('common.cancel')}
              </button>
              <button
                onClick={() => close(true)}
                autoFocus
                className={`rounded-md px-3.5 py-2 text-sm font-medium ${
                  dialog.danger ? 'bg-iron text-chalk hover:bg-iron/90' : 'bg-brass text-ink hover:bg-brass/90'
                }`}
              >
                {dialog.confirmLabel || t('feedback.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className="fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4 pointer-events-none"
        style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
        aria-live="polite"
      >
        {toasts.map((x) => (
          <div
            key={x.id}
            className={`pointer-events-auto card flex items-center gap-2 px-3.5 py-2.5 text-sm max-w-sm w-full shadow-lg ${
              x.tone === 'error' ? 'border-iron text-chalk' : 'border-line text-chalk'
            }`}
          >
            {x.tone === 'error' ? (
              <AlertTriangle size={16} className="text-iron shrink-0" />
            ) : (
              <CheckCircle2 size={16} className="text-good shrink-0" />
            )}
            <span className="flex-1">{x.message}</span>
            <button onClick={() => setToasts((prev) => prev.filter((y) => y.id !== x.id))} className="text-chalkdim hover:text-chalk">
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
