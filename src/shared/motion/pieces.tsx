// Reusable animated pieces built on the springs in lib/motion.ts.

import type { ReactNode } from 'react'
import { AnimatePresence } from 'motion/react'
import * as m from 'motion/react-m'
import { spring, STAGGER } from './springs'

/**
 * Opens and closes its children by animating height, so content below slides
 * instead of jumping. Rows inside fade in with a small stagger when it opens.
 * Nothing animates on first render, only on changes.
 */
export function Collapse({ open, children, className = '' }: { open: boolean; children: ReactNode; className?: string }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <m.div
          key="content"
          // Clip only while opening or closing, so dragged rows inside can
          // move freely once it's open.
          initial={{ height: 0, opacity: 0, overflow: 'hidden' }}
          animate={{
            height: 'auto',
            opacity: 1,
            transition: { ...spring.smooth, staggerChildren: STAGGER },
            transitionEnd: { overflow: 'visible' },
          }}
          exit={{ height: 0, opacity: 0, overflow: 'hidden', transition: spring.smooth }}
          className={className}
        >
          {children}
        </m.div>
      )}
    </AnimatePresence>
  )
}

/**
 * A row that animates in and out of a list (adding a task, deleting, moving it
 * to another group while dragging). Put these inside
 * <AnimatePresence initial={false}> with a stable `key`. Neighbours follow
 * because the height opens and closes. (No `layout` here: dragging moves rows
 * with its own transforms, and the two would fight.)
 */
export function ListRow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <m.div
      // Clip only while entering or leaving, so drag transforms aren't cut off.
      initial={{ height: 0, opacity: 0, overflow: 'hidden' }}
      animate={{ height: 'auto', opacity: 1, transitionEnd: { overflow: 'visible' } }}
      exit={{ height: 0, opacity: 0, overflow: 'hidden' }}
      transition={spring.smooth}
      className={className}
    >
      {children}
    </m.div>
  )
}
