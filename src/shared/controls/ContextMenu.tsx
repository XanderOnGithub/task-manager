// Right-click menu.

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { MENU_BOX, MenuItems, type MenuItem } from './Menu'
import { focusFirstRow, onMenuKeyDown } from './menuKeys'

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
export function ContextMenu({ menuFor }: { menuFor: (target: HTMLElement) => (MenuItem | 'divider')[] | null }) {
  const [menu, setMenu] = useState<{ x: number; y: number; items: (MenuItem | 'divider')[] } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const lookup = useRef(menuFor)
  lookup.current = menuFor
  // What had focus when the menu opened, to give it back when the menu closes.
  const returnTo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (import.meta.env.DEV && e.shiftKey) return
      if (target.closest('input, textarea, [contenteditable="true"]')) return
      e.preventDefault()
      const items = lookup.current(target)
      returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setMenu(items && items.length > 0 ? { x: e.clientX, y: e.clientY, items } : null)
    }
    window.addEventListener('contextmenu', onContextMenu)
    return () => window.removeEventListener('contextmenu', onContextMenu)
  }, [])

  const close = (restoreFocus = false) => {
    setMenu(null)
    if (restoreFocus && returnTo.current?.isConnected) returnTo.current.focus({ preventScroll: true })
  }

  useEffect(() => {
    if (menu) focusFirstRow(box.current)
  }, [menu])

  // Close on a click elsewhere, scrolling or resizing. Escape and Tab are handled on the menu.
  useEffect(() => {
    if (!menu) return
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
