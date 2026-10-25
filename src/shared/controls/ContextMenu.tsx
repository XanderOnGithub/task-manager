// Right-click menu.

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { MENU_BOX, MenuItems, type MenuItem } from './Menu'
import { focusFirstRow, onMenuKeyDown } from './menuKeys'
import { ActionSheet } from './ActionSheet'
import { isHolding, ROW_ACTIONS } from '../drag/hold'
import { isCoarsePointer } from '../../platform/layout'

/** How long (ms) a finger rests on a row before letting go shows its actions. */
const LONG_PRESS = 450

/**
 * Replaces the web view's own right-click menu (Reload, Inspect, Back) with
 * ours. Mount once. `menuFor` gets what was right-clicked and returns the
 * menu for it (usually the item's ⋯ menu), or null for no menu at all.
 *
 * The keyboard's menu key (or Shift+F10) opens it too, on the focused row.
 * Text fields and the page editor keep the system menu, which has cut, copy,
 * paste and spelling. In development, Shift-right-click shows the web view's
 * menu too, for Inspect Element.
 */
export function ContextMenu({
  menuFor,
  titleFor = () => undefined,
}: {
  menuFor: (target: HTMLElement) => (MenuItem | 'divider')[] | null
  /** The sheet's heading on a touch screen: the item's name. */
  titleFor?: (target: HTMLElement) => string | undefined
}) {
  // On a touch screen (`sheet`) the menu rises from the bottom instead of
  // opening at the finger: a long press there means "show me what I can do".
  const [menu, setMenu] = useState<{ x: number; y: number; items: (MenuItem | 'divider')[]; sheet?: string } | null>(null)
  const titleLookup = useRef(titleFor)
  titleLookup.current = titleFor
  const box = useRef<HTMLDivElement>(null)
  const lookup = useRef(menuFor)
  lookup.current = menuFor
  // What had focus when the menu opened, to give it back when the menu closes.
  const returnTo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    // Touch: our own long press on rows, opened when the finger lifts (so the
    // lift can't land on a row of the sheet). Draggable rows are picked up
    // first; drag.ts opens their sheet instead. The phone's own long-press
    // menu is ignored: it fires mid-hold and would fight the drag.
    let lastTouch = 0
    let press: { row: HTMLElement; x: number; y: number; timer: number; long: boolean } | null = null
    const cancelPress = () => {
      if (press) window.clearTimeout(press.timer)
      press = null
    }
    const onTouchStart = (e: TouchEvent) => {
      lastTouch = Date.now()
      cancelPress()
      const t = e.touches[0]
      const target = e.target as HTMLElement
      const row = target.closest<HTMLElement>('[data-item]')
      if (!row || e.touches.length > 1 || target.closest('input, textarea, [contenteditable="true"]')) return
      const current = { row, x: t.clientX, y: t.clientY, timer: 0, long: false }
      current.timer = window.setTimeout(() => {
        if (isHolding()) return
        current.long = true
        navigator.vibrate?.(8)
      }, LONG_PRESS)
      press = current
    }
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0]
      if (press && t && Math.hypot(t.clientX - press.x, t.clientY - press.y) > 10) cancelPress()
    }
    const onTouchEnd = (e: TouchEvent) => {
      const done = press
      cancelPress()
      if (!done?.long || isHolding()) return
      e.preventDefault() // no click on whatever is under the finger
      const items = lookup.current(done.row)
      if (items?.length) setMenu({ x: 0, y: 0, items, sheet: titleLookup.current(done.row) ?? '' })
    }

    const onContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (import.meta.env.DEV && e.shiftKey) return
      if (target.closest('input, textarea, [contenteditable="true"]')) return
      e.preventDefault()
      const fromTouch = (e as PointerEvent).pointerType === 'touch' || Date.now() - lastTouch < 1500
      if (fromTouch || isHolding()) return
      const items = lookup.current(target)
      returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      // A mouse on a touch screen laptop still gets the sheet: it's a touch layout.
      const sheet = isCoarsePointer() ? (titleLookup.current(target) ?? '') : undefined
      setMenu(items && items.length > 0 ? { x: e.clientX, y: e.clientY, items, sheet } : null)
    }
    // A long press on a draggable row that didn't move (drag.ts).
    const onRowActions = (e: Event) => {
      const id = (e as CustomEvent<string>).detail
      const row = [...document.querySelectorAll<HTMLElement>('[data-item]')].find((el) => el.dataset.item === id)
      const items = row ? lookup.current(row) : null
      if (row && items?.length) setMenu({ x: 0, y: 0, items, sheet: titleLookup.current(row) ?? '' })
    }
    window.addEventListener('contextmenu', onContextMenu)
    window.addEventListener(ROW_ACTIONS, onRowActions)
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onTouchEnd)
    window.addEventListener('touchcancel', cancelPress)
    return () => {
      cancelPress()
      window.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener(ROW_ACTIONS, onRowActions)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', cancelPress)
    }
  }, [])

  const close = (restoreFocus = false) => {
    setMenu(null)
    if (restoreFocus && returnTo.current?.isConnected) returnTo.current.focus({ preventScroll: true })
  }

  useEffect(() => {
    if (menu && menu.sheet === undefined) focusFirstRow(box.current)
  }, [menu])

  // Close on a click elsewhere, scrolling or resizing. Escape and Tab are handled on the menu.
  useEffect(() => {
    if (!menu || menu.sheet !== undefined) return
    const hide = () => setMenu(null)
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && hide()
    document.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    window.addEventListener('blur', hide)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
      window.removeEventListener('blur', hide)
    }
  }, [menu])

  if (!menu) return null
  if (menu.sheet !== undefined) return <ActionSheet title={menu.sheet || undefined} items={menu.items} onClose={() => setMenu(null)} />
  // Opens at the pointer, flipped left or up when it would run off the window.
  const height = 12 + menu.items.length * 31
  const style: CSSProperties = {
    position: 'fixed',
    left: Math.min(menu.x, window.innerWidth - 216),
    top: menu.y + height > window.innerHeight ? Math.max(8, menu.y - height) : menu.y,
  }
  return createPortal(
    // The arrow keys act on the rows inside; the menu itself isn't a tab stop.
     
    <div
      ref={box}
      role="menu"
      tabIndex={-1}
      aria-label="Actions"
      style={style}
      className={MENU_BOX}
      onKeyDown={(e) => onMenuKeyDown(e, close)}
    >
      <MenuItems items={menu.items} onPicked={() => close(true)} />
    </div>,
    document.body,
  )
}
