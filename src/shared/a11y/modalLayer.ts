// What every dialog has to do for keyboard and screen reader users, in one place.
//
// While a dialog is open:
// - focus moves into it, and Tab stays inside it;
// - everything behind it is inert (can't be focused, clicked or read);
// - Escape closes the topmost dialog only;
// - when the last dialog closes, focus goes back to where it was.
//
// Dialogs are drawn in a portal on <body>, outside #root, so making #root inert
// doesn't touch them.

import { useEffect, useRef, type RefObject } from 'react'
import { tabbables, trapTab } from './focus'

/** Open dialogs, topmost last. */
const stack: symbol[] = []

function setBackgroundInert(inert: boolean) {
  const root = document.getElementById('root')
  if (!root) return
  if (inert) root.setAttribute('inert', '')
  else root.removeAttribute('inert')
}

/** How many dialogs are open (for tests). */
export function openDialogs(): number {
  return stack.length
}

/**
 * Makes `dialog` behave as a modal dialog while it is mounted.
 * `onClose` runs on Escape (when this is the topmost dialog). Pass
 * `active = false` once the dialog starts closing, if it stays on screen a
 * moment longer (an exit animation): the page behind comes back at once.
 */
export function useModalLayer(dialog: RefObject<HTMLElement | null>, onClose: () => void, active = true) {
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    const el = dialog.current
    if (!el || !active) return
    const layer = Symbol('dialog')
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null

    stack.push(layer)
    if (stack.length === 1) setBackgroundInert(true)

    // Focus goes to the first thing inside, unless a field already took it (autoFocus).
    if (!el.contains(document.activeElement)) (tabbables(el)[0] ?? el).focus({ preventScroll: true })

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== layer) return
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault()
        close.current()
      } else if (e.key === 'Tab') {
        trapTab(e, el)
      }
    }
    document.addEventListener('keydown', onKey)

    return () => {
      document.removeEventListener('keydown', onKey)
      stack.splice(stack.indexOf(layer), 1)
      if (stack.length === 0) setBackgroundInert(false)
      // Back to where you were, if that is still on screen.
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [dialog, active])
}
