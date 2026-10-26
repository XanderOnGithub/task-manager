// Action sheet: a menu that rises from the bottom edge, for touch screens.
// Every ⋯ menu and every long press opens one there instead of a small
// floating menu: big rows near the thumb, the item's name on top, and it goes
// away with a tap outside, a pull down on the handle, or Escape.

import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, useDragControls } from 'motion/react'
import { useModalLayer } from '../a11y/modalLayer'
import { spring } from '../motion/springs'
import type { MenuItem } from './Menu'
import { onMenuKeyDown } from './menuKeys'

/** How far the handle must be pulled down (px) to close the sheet. */
const CLOSE_DISTANCE = 60

export function ActionSheet({
  title,
  label = 'Actions',
  items,
  onClose,
}: {
  /** Shown above the rows: usually the item's name. */
  title?: string
  /** For screen readers when there is no title. */
  label?: string
  items: (MenuItem | 'divider')[]
  onClose: () => void
}) {
  const panel = useRef<HTMLDivElement>(null)
  const drag = useDragControls()
  // Slides away first, then runs what was picked (so a confirm dialog it opens
  // doesn't appear under a sheet that is still leaving).
  const [leaving, setLeaving] = useState<{ then?: () => void } | null>(null)
  const close = (then?: () => void) => setLeaving((l) => l ?? { then })
  useModalLayer(panel, () => close())

  return createPortal(
    <div
      role="presentation"
      className={`fixed inset-0 z-50 bg-scrim transition-opacity duration-150 ${leaving ? 'opacity-0' : 'animate-fade-in'}`}
      onPointerDown={(e) => e.target === e.currentTarget && close()}
    >
      <motion.div
        ref={panel}
        role="menu"
        aria-label={title ?? label}
        tabIndex={-1}
        initial={{ y: '100%' }}
        animate={{ y: leaving ? '100%' : 0 }}
        transition={leaving ? spring.snappy : spring.smooth}
        onAnimationComplete={() => {
          if (!leaving) return
          onClose()
          leaving.then?.()
        }}
        drag="y"
        dragControls={drag}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.7 }}
        onDragEnd={(_, info) => (info.offset.y > CLOSE_DISTANCE || info.velocity.y > 500) && close()}
        onKeyDown={(e) => onMenuKeyDown(e, () => close())}
        className="absolute inset-x-2 bottom-2 flex max-h-[80dvh] flex-col overflow-hidden rounded-[16px] border border-border-menu bg-menu pb-[env(safe-area-inset-bottom)] shadow-window outline-none"
      >
        <div
          aria-hidden="true"
          onPointerDown={(e) => drag.start(e)}
          className="flex h-5 shrink-0 touch-none items-center justify-center"
        >
          <span className="h-1 w-9 rounded-full bg-border-strong" />
        </div>
        {title && <div className="truncate px-5 pb-2 text-meta text-fg-3">{title}</div>}
        <div className="flex min-h-0 flex-col overflow-y-auto px-2 pb-2">
          {items.map((item, i) =>
            item === 'divider' ? (
              <div key={`d${i}`} role="separator" className="mx-3 my-1 h-px bg-border" />
            ) : (
              <button
                key={item.label}
                role="menuitem"
                tabIndex={-1}
                onClick={() => close(item.onSelect)}
                className={`flex h-12 shrink-0 items-center gap-3.5 rounded-[10px] px-3 text-left text-[15px] transition-colors duration-100 active:bg-hover ${
                  item.danger ? 'text-danger' : 'text-fg'
                }`}
              >
                {item.Icon && <item.Icon size={19} strokeWidth={1.75} aria-hidden="true" className={item.danger ? '' : 'text-fg-2'} />}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </button>
            ),
          )}
        </div>
      </motion.div>
    </div>,
    document.body,
  )
}
