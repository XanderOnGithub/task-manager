// Keyboard focus helpers shared by dialogs and menus.

/** What the Tab key can land on. */
const TABBABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'

/** The elements inside `root` that Tab reaches, in order, skipping hidden ones. */
export function tabbables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(TABBABLE)].filter((el) => el.getClientRects().length > 0)
}

/** Keeps Tab and Shift+Tab inside `root`: from the last element it wraps to the first, and back. */
export function trapTab(event: KeyboardEvent, root: HTMLElement) {
  const items = tabbables(root)
  if (items.length === 0) {
    event.preventDefault()
    root.focus()
    return
  }
  const first = items[0]
  const last = items[items.length - 1]
  const active = document.activeElement
  if (event.shiftKey && (active === first || !root.contains(active))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (active === last || !root.contains(active))) {
    event.preventDefault()
    first.focus()
  }
}

/** Text fields, the editor and dropdowns keep their own keys (arrows, typing, undo). */
export function isTextEntry(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  return el.isContentEditable || el.closest('[contenteditable="true"]') !== null || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}
