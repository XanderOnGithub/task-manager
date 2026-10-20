// Keyboard use of an open menu (the ⋯ menus and the right-click menu).
//
// Down and Up move between rows (wrapping), Home and End jump to the first and
// last, Escape closes and puts focus back where it was, and Tab closes the
// menu too (a menu is one stop in the Tab order, not a list to Tab through).

import type { KeyboardEvent } from 'react'

const ROWS = '[role="menuitem"]'

/** The rows of the menu `container`. */
function rows(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(ROWS)]
}

/** Moves focus to the first row. Call when a menu opens. */
export function focusFirstRow(container: HTMLElement | null) {
  rows(container ?? document.body)[0]?.focus({ preventScroll: true })
}

/** Handles a key pressed inside an open menu. `close(true)` should close it and restore focus. */
export function onMenuKeyDown(e: KeyboardEvent<HTMLElement>, close: (restoreFocus: boolean) => void) {
  const all = rows(e.currentTarget)
  if (all.length === 0) return
  const at = all.indexOf(document.activeElement as HTMLElement)
  const focus = (i: number) => {
    e.preventDefault()
    all[(i + all.length) % all.length].focus({ preventScroll: true })
  }
  switch (e.key) {
    case 'ArrowDown':
      return focus(at + 1)
    case 'ArrowUp':
      return focus(at <= 0 ? all.length - 1 : at - 1)
    case 'Home':
      return focus(0)
    case 'End':
      return focus(all.length - 1)
    case 'Escape':
      e.preventDefault()
      e.stopPropagation()
      return close(true)
    case 'Tab':
      e.preventDefault()
      return close(true)
  }
}
