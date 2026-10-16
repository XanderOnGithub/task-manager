// Reusable animated pieces built on the springs in lib/motion.ts.

import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { spring, STAGGER } from '../lib/motion'

/**
 * Opens and closes its children by animating height, so content below slides
 * instead of jumping. Rows inside fade in with a small stagger when it opens.
 * Nothing animates on first render, only on changes.
 */
export function Collapse({ open, children, className = '' }: { open: boolean; children: ReactNode; className?: string }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="content"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1, transition: { ...spring.smooth, staggerChildren: STAGGER } }}
          exit={{ height: 0, opacity: 0, transition: spring.smooth }}
          className={`overflow-hidden ${className}`}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/**
 * A row that animates in and out of a list (adding a task, filing an item,
 * deleting). Put these inside <AnimatePresence initial={false}> with a stable
 * `key`. Neighbours slide to fill the gap because of `layout`.
 */
export function ListRow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      layout="position"
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={spring.smooth}
      className={`overflow-hidden ${className}`}
    >
      {children}
    </motion.div>
  )
}
