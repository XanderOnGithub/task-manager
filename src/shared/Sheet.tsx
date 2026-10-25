// Sheet: a panel that rises from the bottom edge on a narrow window (the task
// details). Pull its handle down to close it. A dialog like any other: focus
// stays inside, the page behind is inert, Escape closes.

import { useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion, useDragControls } from 'motion/react'
import { useModalLayer } from './a11y/modalLayer'
import { spring } from './motion/springs'

/** How far the handle must be pulled down (px) to close the sheet. */
const CLOSE_DISTANCE = 100

export function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDivElement>(null)
  const drag = useDragControls()
  useModalLayer(dialog, onClose)

  return createPortal(
    <div role="presentation" className="fixed inset-0 z-50 animate-fade-in bg-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={spring.smooth}
        // Only the handle starts a drag, so scrolling the sheet's content never moves the sheet.
        drag="y"
        dragControls={drag}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={(_, info) => info.offset.y > CLOSE_DISTANCE && onClose()}
        className="absolute inset-x-0 bottom-0 flex max-h-[92dvh] min-h-[50dvh] flex-col rounded-t-panel border-t border-border-menu bg-panel shadow-window outline-none"
      >
        {/* Decorative: closing is also the Close button inside, Escape, or a tap outside. */}
        <div
          aria-hidden="true"
          onPointerDown={(e) => drag.start(e)}
          className="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center"
        >
          <span className="h-1 w-9 rounded-full bg-border-strong" />
        </div>
        <div className="flex min-h-0 flex-1 flex-col pb-[env(safe-area-inset-bottom)]">{children}</div>
      </motion.div>
    </div>,
    document.body,
  )
}
