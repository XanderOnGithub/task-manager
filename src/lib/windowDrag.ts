// Dragging the window by its empty space (anything marked data-tauri-drag-region).
//
// Tauri has its own handler for this, but on macOS it only worked once: after
// macOS moves the window, the web view never hears the mouse go up, so the
// next press arrives looking like the second click of a double-click, and
// Tauri's handler ignores those. This one decides double-clicks itself, by
// time and distance, so every press on empty space drags. It runs first and
// stops Tauri's handler from also acting.
//
// The rules for what counts as empty space are Tauri's: the marked element
// itself (not what's inside it), never a button, link or field.

import { invoke } from '@tauri-apps/api/core'

const ATTR = 'data-tauri-drag-region'
const CLICKABLE = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL', 'SUMMARY'])
const ROLES = new Set(['button', 'link', 'menuitem', 'tab', 'checkbox', 'radio', 'switch', 'option'])
/** Two presses this close in time and place are a double-click (zoom the window). */
const DOUBLE_MS = 400
const DOUBLE_PX = 4

function isClickable(el: HTMLElement) {
  return (
    CLICKABLE.has(el.tagName) ||
    el.isContentEditable ||
    (el.hasAttribute('tabindex') && el.getAttribute('tabindex') !== '-1') ||
    ROLES.has(el.getAttribute('role') ?? '')
  )
}

/** Same as Tauri: walk up from what was pressed; a button on the way blocks it. */
function isDragRegion(path: EventTarget[]): boolean {
  for (const el of path) {
    if (!(el instanceof HTMLElement)) continue
    const attr = el.getAttribute(ATTR)
    if (attr === null) {
      if (isClickable(el)) return false
      continue
    }
    if (attr === 'false') return false
    if (attr === 'deep') return true
    return el === path[0]
  }
  return false
}

export function installWindowDrag() {
  if (!('__TAURI_INTERNALS__' in window)) return
  let last = { time: 0, x: 0, y: 0 }
  window.addEventListener(
    'mousedown',
    (e) => {
      if (e.button !== 0 || !isDragRegion(e.composedPath())) return
      // Keep Tauri's own handler (and text selection) out of it.
      e.preventDefault()
      e.stopImmediatePropagation()
      const now = performance.now()
      const double =
        now - last.time < DOUBLE_MS && Math.abs(e.clientX - last.x) < DOUBLE_PX && Math.abs(e.clientY - last.y) < DOUBLE_PX
      last = double ? { time: 0, x: 0, y: 0 } : { time: now, x: e.clientX, y: e.clientY }
      void invoke(double ? 'plugin:window|internal_toggle_maximize' : 'plugin:window|start_dragging').catch(() => {})
    },
    true,
  )
}
