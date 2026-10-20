// Moving around lists and the board with the keyboard.
//
// Any row with `data-item` takes part, in the sidebar and in the main panel.
// With a row focused (click it, Tab to it, or keep going from the last one):
//
//   ↑ ↓      the row above or below (on the board: in the same column)
//   ← →      the board's next column (the card nearest in height)
//   Enter    open it (a task or milestone opens in the details panel)
//   S        a task's next status, same as clicking its circle
//   Delete   delete it (Undo in the toast; things with items inside ask first)
//   Space    pick it up to move it with the arrows (dnd-kit, see drag.ts)
//   Esc      close the details panel and let go of the row
//
// Rows are found on screen rather than from the data, so whatever order and
// folding you see is the order the keys follow.

import { useEffect, useRef } from 'react'
import type { Item } from './api'
import { isTextEntry } from './focus'

export interface RowKeyHandlers {
  byId: Map<string, Item>
  /** Enter on an area, project or page. */
  open: (id: string) => void
  /** Enter on a task or milestone, and following along with the arrows while the details panel is open. */
  select: (id: string | null) => void
  selectedId: string | null
  cycleStatus: (task: Item) => void
  trash: (item: Item) => Promise<unknown>
}

const ROW = '[data-item]'

export function useRowKeys(handlers: RowKeyHandlers) {
  // The latest handlers, so the listener is added once.
  const latest = useRef(handlers)
  latest.current = handlers

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (!target || isTextEntry(target)) return
      // Nothing focused yet (clicking a row doesn't always focus it): the
      // arrows start from the row you last clicked, the selected one, or the top.
      if (target === document.body && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        const start = startingRow(latest.current.selectedId)
        if (start) {
          e.preventDefault()
          focusRow(start)
        }
        return
      }
      const row = target.closest<HTMLElement>(ROW)
      if (!row) return
      // While a row is picked up, the arrows belong to the drag.
      if (document.querySelector(`${ROW}[aria-pressed="true"]`)) return

      const { byId, open, select, selectedId, cycleStatus, trash } = latest.current
      const item = byId.get(row.dataset.item ?? '')

      const go = (next: HTMLElement | null) => {
        e.preventDefault()
        if (!next) return
        focusRow(next)
        // With the details panel open, it follows you.
        const nextItem = byId.get(next.dataset.item ?? '')
        if (selectedId && nextItem && (nextItem.kind === 'task' || nextItem.kind === 'milestone')) select(nextItem.id)
      }

      switch (e.key) {
        case 'ArrowDown':
          return go(nearest(row, 'down'))
        case 'ArrowUp':
          return go(nearest(row, 'up'))
        case 'ArrowLeft':
          return go(nearest(row, 'left'))
        case 'ArrowRight':
          return go(nearest(row, 'right'))
        case 'Enter':
          if (!item) return
          // Enter on a button inside the row (the status circle, the fold
          // arrow, a ⋯ menu) is that button's own, not "open this row".
          if (isNestedControl(target, row)) return
          e.preventDefault()
          if (item.kind === 'task' || item.kind === 'milestone') select(item.id)
          else open(item.id)
          return
        case 's':
        case 'S':
          if (item?.kind !== 'task') return
          e.preventDefault()
          keepFocusNearby(row, () => cycleStatus(item))
          return
        case 'Delete':
        case 'Backspace':
          if (!item) return
          e.preventDefault()
          keepFocusNearby(row, () => trash(item))
          return
        case 'Escape':
          e.preventDefault()
          select(null)
          target.blur()
          return
      }
    }
    // Remember the last row clicked, as a starting point for the arrows.
    const onPointer = (e: PointerEvent) => {
      lastClicked = (e.target as HTMLElement | null)?.closest<HTMLElement>(ROW) ?? lastClicked
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer, true)
    }
  }, [])
}

let lastClicked: HTMLElement | null = null

/** Where the arrows start when no row has focus. */
function startingRow(selectedId: string | null): HTMLElement | null {
  const visible = (el: HTMLElement | null) => (el && el.isConnected && el.getClientRects().length > 0 ? el : null)
  const selected = selectedId
    ? document.querySelector<HTMLElement>(`main ${ROW}[data-item="${CSS.escape(selectedId)}"]`)
    : null
  return visible(lastClicked) ?? visible(selected) ?? document.querySelector<HTMLElement>(`main ${ROW}`)
}

/** True for a button, link or similar inside `row` (not the row itself). */
function isNestedControl(target: HTMLElement, row: HTMLElement): boolean {
  if (target === row) return false
  const control = target.closest('button, a[href], summary, [role="button"], [role="menuitem"], [role="switch"], [role="checkbox"], [role="radio"]')
  return control !== null && control !== row && row.contains(control)
}

/**
 * Focuses a row: the row itself if it takes focus (draggable rows do, and
 * other rows have tabIndex -1 so the arrows can land on them), otherwise its
 * first button.
 */
function focusRow(row: HTMLElement) {
  const target = row.hasAttribute('tabindex') ? row : (row.querySelector<HTMLElement>('button') ?? row)
  target.focus({ preventScroll: true })
  row.scrollIntoView({ block: 'nearest' })
}

/** Rows you can move to from `row`: visible ones in the same part of the window (sidebar or main panel). */
function rowsNear(row: HTMLElement): HTMLElement[] {
  const region = row.closest('main, nav') ?? document.body
  return [...region.querySelectorAll<HTMLElement>(ROW)].filter(
    (el) => el !== row && el.getClientRects().length > 0 && !el.closest('[inert], [aria-hidden="true"]'),
  )
}

type Direction = 'up' | 'down' | 'left' | 'right'

/**
 * The closest row in a direction, by where things are on screen. Up and down
 * stay in the same column (rows that overlap side to side); left and right
 * jump to the next column and pick the card closest in height.
 */
function nearest(row: HTMLElement, direction: Direction): HTMLElement | null {
  const from = row.getBoundingClientRect()
  const midY = from.top + from.height / 2
  let best: HTMLElement | null = null
  let bestScore = Infinity
  for (const el of rowsNear(row)) {
    const r = el.getBoundingClientRect()
    const overlapsX = r.left < from.right && r.right > from.left
    const y = r.top + r.height / 2
    let score: number
    if (direction === 'up' || direction === 'down') {
      if (!overlapsX) continue
      const dy = direction === 'down' ? y - midY : midY - y
      if (dy <= 1) continue
      score = dy
    } else {
      if (overlapsX) continue
      const dx = direction === 'right' ? r.left - from.left : from.left - r.left
      if (dx <= 0) continue
      // The nearest column first, then the closest height within it.
      score = dx * 1000 + Math.abs(y - midY)
    }
    if (score < bestScore) {
      bestScore = score
      best = el
    }
  }
  return best
}

/**
 * Runs a change that may make the row leave the list (a task marked done
 * leaves an area's open tasks; a deleted one leaves everywhere). If it goes,
 * focus moves to the row that took its place, so you can keep going.
 */
function keepFocusNearby(row: HTMLElement, change: () => unknown) {
  const next = nearest(row, 'down') ?? nearest(row, 'up')
  const nextId = next?.dataset.item
  if (!nextId) return void change()
  const started = Date.now()
  // Watch until the row is gone (after its exit animation) or clearly staying.
  const check = () => {
    if (!row.isConnected) {
      const still = document.querySelector<HTMLElement>(`${ROW}[data-item="${CSS.escape(nextId)}"]`)
      if (still && (document.activeElement === document.body || document.activeElement === null)) focusRow(still)
      return
    }
    if (Date.now() - started < 1500) window.setTimeout(check, 80)
  }
  void Promise.resolve(change()).then(check)
}
