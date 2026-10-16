// The thing you're holding while dragging: lifted, and swinging with movement.
// See lib/drag.ts for the rest of the drag setup.

import { useEffect, type ReactNode } from 'react'
import { motion, useSpring } from 'motion/react'
import { spring } from '../lib/motion'

/**
 * The thing you're holding. Wrap the dragged item's look in this inside
 * <DragOverlay>. `width` keeps wide rows from swinging as far as small cards.
 */
export function Lifted({
  children,
  grab,
  width,
  className = '',
}: {
  children: ReactNode
  grab: { x: number; y: number }
  width: number
  className?: string
}) {
  // A wide list row tilting 6° would swing its far end a long way, so the
  // maximum angle shrinks with width: ~6° for a 200px card, ~2° for a 600px row.
  const maxDeg = Math.min(6, Math.max(1.5, 1200 / Math.max(width, 1)))
  // Low damping = a little sway as it comes back upright. This is the "swing".
  const rotate = useSpring(0, { stiffness: 260, damping: 13, mass: 0.7 })

  useEffect(() => {
    let last: { x: number; t: number } | null = null
    let idle = 0
    const onMove = (e: PointerEvent) => {
      const t = performance.now()
      if (last) {
        // Horizontal speed in px per ms. ~1.2 px/ms (a quick flick) reaches the max angle.
        const speed = (e.clientX - last.x) / Math.max(8, t - last.t)
        rotate.set(Math.max(-maxDeg, Math.min(maxDeg, (speed / 1.2) * maxDeg)))
      }
      last = { x: e.clientX, t }
      // When the pointer stops, swing back upright.
      window.clearTimeout(idle)
      idle = window.setTimeout(() => rotate.set(0), 60)
    }
    window.addEventListener('pointermove', onMove)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.clearTimeout(idle)
    }
  }, [rotate, maxDeg])

  return (
    <motion.div
      style={{ rotate, transformOrigin: `${grab.x}px ${grab.y}px` }}
      initial={{ scale: 1 }}
      animate={{ scale: 1.02 }}
      transition={spring.snappy}
      // Sized by its content, not the overlay box: a milestone is measured
      // open but lifted folded shut.
      className={`cursor-grabbing shadow-menu ${className}`}
    >
      {children}
    </motion.div>
  )
}

