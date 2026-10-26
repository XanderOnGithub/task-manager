// Long press on a touch screen. Holding a row picks it up (TouchSensor in
// drag.ts); letting go without moving opens its actions instead, as a bottom
// sheet, the way phone apps do. Moving while held drags as usual. The phone's
// own long-press menu would open at the same moment and fight the drag, so the
// right-click menu ignores it while something is held (`isHolding`).
//
// The sheet is opened by shared/controls/ContextMenu.tsx, which listens for
// ROW_ACTIONS. Kept apart from drag.ts so the menu doesn't load the sounds.

import type { DragStartEvent } from '@dnd-kit/core'

/** Event asking ContextMenu.tsx to show a row's actions; `detail` is the item id. */
export const ROW_ACTIONS = 'moss-row-actions'

/** Further than this (px) from where the finger went down counts as a drag. */
const HOLD_SLOP = 10

let holding = false
let held: { id: string; x: number; y: number; moved: boolean } | null = null

/** True while a row is picked up (by any pointer). */
export const isHolding = () => holding

function onHeldMove(e: TouchEvent) {
  const t = e.touches[0]
  if (held && t && Math.hypot(t.clientX - held.x, t.clientY - held.y) > HOLD_SLOP) held.moved = true
}

export function startHold(event: DragStartEvent) {
  holding = true
  const touch = typeof TouchEvent !== 'undefined' && event.activatorEvent instanceof TouchEvent ? event.activatorEvent.touches[0] : null
  if (!touch) return
  held = { id: String(event.active.id), x: touch.clientX, y: touch.clientY, moved: false }
  window.addEventListener('touchmove', onHeldMove, { passive: true })
  // A short buzz where the phone allows it: the row has lifted.
  navigator.vibrate?.(8)
}

/** Ends a hold. Returns the item id when it was a long press that didn't move. */
export function endHold(): string | null {
  holding = false
  window.removeEventListener('touchmove', onHeldMove)
  const pressed = held && !held.moved ? held.id : null
  held = null
  return pressed
}

