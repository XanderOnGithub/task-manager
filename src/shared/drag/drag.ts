// Drag and drop setup (dnd-kit), shared by the list, board and sidebar.
// The dragged item's look and swing live in components/Lifted.tsx.
//
// The feel:
// - Picking something up lifts it: it scales up a touch and its shadow deepens.
// - While you drag, it swings: it leans in the direction you're moving, more
//   the faster you go, pivoting around the point you grabbed, like it's
//   hanging from the cursor. A slightly springy rotation makes it settle with a
//   little sway when you stop.
// - Dropping glides it into its slot; the neighbours have already made room.

import { useMemo, useRef, useState } from 'react'
import {
  closestCenter,
  defaultDropAnimationSideEffects,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragOverEvent,
  type DragStartEvent,
  type DropAnimation,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { play } from '../../sound/sounds'

/**
 * Mouse drags start after moving 4px, so plain clicks still click. Keyboard:
 * focus a row, press Space to pick it up, arrows to move, Space to drop.
 */
export function useDragSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    // Space picks up and drops; Enter is left for opening (lib/rowKeys.ts).
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    }),
  )
}

/** The glide into place when you let go. */
export const dropSettle: DropAnimation = {
  duration: 180,
  easing: 'cubic-bezier(0.2, 0, 0, 1)',
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0' } } }),
}

/**
 * Only lets `type` land on droppables of the same type (plus any `alsoInto`
 * types, e.g. a task can land on a milestone header). Prefers whatever is
 * directly under the pointer, then the nearest one.
 */
export function collisionFor(alsoInto: Record<string, string[]> = {}): CollisionDetection {
  return (args) => {
    const type = args.active.data.current?.type as string | undefined
    const ofType = (t: string) => args.droppableContainers.filter((c) => c.data.current?.type === t)
    const same = ofType(type ?? '')
    const underSame = pointerWithin({ ...args, droppableContainers: same }).filter((c) => c.id !== args.active.id)
    if (underSame.length) return underSame
    for (const other of alsoInto[type ?? ''] ?? []) {
      const under = pointerWithin({ ...args, droppableContainers: ofType(other) })
      if (under.length) return under
    }
    return closestCenter({ ...args, droppableContainers: same })
  }
}

/** Where inside the element the pointer grabbed it, for the swing's pivot. */
export function grabPoint(event: DragStartEvent): { x: number; y: number } {
  const rect = event.active.rect.current.initial
  const pointer = event.activatorEvent as PointerEvent | KeyboardEvent
  if (!rect || !('clientX' in pointer)) return { x: 24, y: 16 }
  return { x: pointer.clientX - rect.left, y: pointer.clientY - rect.top }
}

/**
 * Letting go of a drag also fires a click on whatever is under the pointer,
 * which would open a project or select a task. Eat that one click.
 */
function swallowNextClick() {
  const stop = (e: MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
  }
  window.addEventListener('click', stop, { capture: true, once: true })
  // The click comes right after the pointer is released, in the same task.
  // If none comes (Escape, keyboard drag), drop the listener.
  window.setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0)
}

/** Hook for the overlay state shared by every drag surface. */
export function useDragState() {
  const [active, setActive] = useState<{ id: string; grab: { x: number; y: number }; width: number } | null>(null)
  // The last thing the dragged item was over, for the slot tick.
  const lastOver = useRef<{ id: string; top: number } | null>(null)
  return useMemo(
    () => ({
      active,
      /** Call from onDragOver: a tiny tick each time the item reaches a new
       * spot, a touch higher moving up and lower moving down. */
      over: ({ active: dragged, over }: DragOverEvent) => {
        if (!over || over.id === dragged.id) return
        const previous = lastOver.current
        lastOver.current = { id: String(over.id), top: over.rect.top }
        if (!previous || previous.id === over.id) return
        play('slot', { pitch: over.rect.top < previous.top ? 1.08 : 0.94 })
      },
      start: (event: DragStartEvent) => {
        play('pickUp')
        lastOver.current = null
        setActive({
          id: String(event.active.id),
          grab: grabPoint(event),
          width: event.active.rect.current.initial?.width ?? 300,
        })
      },
      /** `landed`: false when the drag was cancelled (no drop sound), or when
       * the drop makes its own sound (a board card changing status). */
      end: (landed = true) => {
        if (landed) play('drop')
        setActive(null)
        swallowNextClick()
      },
    }),
    [active],
  )
}

/** How siblings slide aside while you drag. Same curve as the rest of the app. */
export const SLIDE = { duration: 160, easing: 'cubic-bezier(0.2, 0, 0, 1)' }
