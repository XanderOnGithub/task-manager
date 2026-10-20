// Renders one toast at a time (a new one replaces the old one), bottom center.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { spring } from '../lib/motion'
import { ToastContext, type ToastInput } from '../lib/toast'
import { play } from '../lib/sounds'
import { isTextEntry } from '../lib/focus'
import { keys } from '../lib/platform'

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
    if (action) play('undo')
    await action?.()
  }, [toast])

  // ⌘Z runs the toast's Undo while it's showing, except in a text field or the
  // page editor, where ⌘Z undoes typing as usual.
  useEffect(() => {
    if (!toast?.undo) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !isTextEntry(e.target)) {
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
      {/* Screen readers hear a message from a region that is always there;
          one that appears together with its text is often missed. Drawn in a
          portal so it still works while a dialog has made the page inert. */}
      {createPortal(
        <>
          <div role="status" className="sr-only">
            {toast && toast.tone !== 'error' ? toast.message : ''}
          </div>
          <div role="alert" className="sr-only">
            {toast?.tone === 'error' ? toast.message : ''}
          </div>
          <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.key}
          initial={{ opacity: 0, y: 12, scale: 0.96, x: '-50%' }}
          animate={{ opacity: 1, y: 0, scale: 1, x: '-50%', transition: spring.pop }}
          exit={{ opacity: 0, y: 8, scale: 0.98, x: '-50%', transition: spring.snappy }}
          className="fixed bottom-6 left-1/2 z-50 flex h-10 max-w-[80vw] items-center gap-3 rounded-[10px] border border-border-menu bg-menu pr-2 pl-3.5 whitespace-nowrap shadow-menu"
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
              title={`Undo (${keys('Z')})`}
              className="h-7 rounded-control bg-hover px-2.5 font-medium transition-colors duration-100 hover:bg-border-strong"
            >
              Undo
            </button>
          )}
        </motion.div>
      )}
      </AnimatePresence>
        </>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}
