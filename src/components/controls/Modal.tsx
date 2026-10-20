// Modal: centered dialog over a dimmed window.
//
// Focus, Escape, the inert background and focus restore are in lib/modalLayer.ts.

import { useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useModalLayer } from '../../lib/modalLayer'

export function Modal({
  label,
  onClose,
  children,
  width = 'w-[480px]',
}: {
  label: string
  onClose: () => void
  children: ReactNode
  width?: string
}) {
  const dialog = useRef<HTMLDivElement>(null)
  useModalLayer(dialog, onClose)

  return createPortal(
    // The backdrop is only a click target for pointer users; keyboard users close with Escape.
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex animate-fade-in items-start justify-center bg-scrim pt-[18vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`${width} animate-menu-in rounded-panel border border-border-menu bg-menu shadow-window outline-none`}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
