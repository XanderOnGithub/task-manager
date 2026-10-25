// Drawer: the sidebar on a narrow window. Slides in from the left over a dimmed
// window. It is a dialog like any other (shared/a11y/modalLayer.ts): focus moves
// in and stays, the page behind is inert, Escape closes, focus goes back.

import { useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import { useModalLayer } from './a11y/modalLayer'
import { spring } from './motion/springs'

export function Drawer({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDivElement>(null)
  useModalLayer(dialog, onClose)

  return createPortal(
    // The backdrop is only a click target for pointer users; keyboard users close with Escape.
    <div role="presentation" className="fixed inset-0 z-50 animate-fade-in bg-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        initial={{ x: '-100%' }}
        animate={{ x: 0 }}
        transition={spring.smooth}
        className="flex h-full w-[min(88vw,320px)] flex-col overflow-y-auto border-r border-border-menu bg-window-solid pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-window outline-none"
      >
        {children}
      </motion.div>
    </div>,
    document.body,
  )
}
