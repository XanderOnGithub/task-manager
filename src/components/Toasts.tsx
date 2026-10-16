// Renders one toast at a time (a new one replaces the old one), bottom center.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ToastContext, type ToastInput } from '../lib/toast'

/** How long a toast stays up. Longer when there's an Undo to reach for. */
const DURATION_MS = 4000
const DURATION_WITH_UNDO_MS = 7000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastInput & { key: number }) | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const show = useCallback((input: ToastInput) => {
    window.clearTimeout(timer.current)
    setToast({ ...input, key: Date.now() })
    timer.current = window.setTimeout(() => setToast(null), input.undo ? DURATION_WITH_UNDO_MS : DURATION_MS)
  }, [])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const undo = useCallback(async () => {
    const action = toast?.undo
    setToast(null)
    await action?.()
  }, [toast])

  // ⌘Z runs the toast's Undo while it's showing, except inside a text field,
  // where ⌘Z undoes typing as usual.
  useEffect(() => {
    if (!toast?.undo) return
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault()
        void undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toast, undo])

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div
          key={toast.key}
          role="status"
          className="fixed bottom-6 left-1/2 z-50 flex h-10 max-w-[80vw] -translate-x-1/2 animate-toast-in items-center gap-3 rounded-[10px] border border-border-menu bg-menu pr-2 pl-3.5 whitespace-nowrap shadow-menu"
        >
          {toast.tone !== 'error' && (
            <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
              <circle cx="12" cy="12" r="9" className="fill-accent" />
              <path
                d="m8.5 12 2.5 2.5 4.5-5"
                fill="none"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="stroke-on-accent"
              />
            </svg>
          )}
          <span className={`truncate ${toast.tone === 'error' ? 'text-danger' : ''} ${toast.undo ? '' : 'pr-1.5'}`}>
            {toast.message}
          </span>
          {toast.undo && (
            <button
              onClick={() => void undo()}
              title="Undo (⌘Z)"
              className="h-7 rounded-control bg-hover px-2.5 font-medium transition-colors duration-150 hover:bg-border-strong"
            >
              Undo
            </button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  )
}
