// Menu: the ⋯ button and its dropdown.

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Ellipsis, type LucideIcon } from 'lucide-react'
import { icon } from '../../lib/items'
import { focusFirstRow, onMenuKeyDown } from './menuKeys'

export interface MenuItem {
  label: string
  Icon?: LucideIcon
  shortcut?: string
  danger?: boolean
  onSelect: () => void
}

export function Menu({
  items,
  label = 'More actions',
  trigger,
  align = 'right',
}: {
  items: (MenuItem | 'divider')[]
  label?: string
  /** Custom button content. Defaults to ⋯. */
  trigger?: ReactNode
  align?: 'left' | 'right'
}) {
  // Where the dropdown sits, worked out from the button when it opens. The
  // dropdown is drawn on top of the whole window (a portal), so scrolling
  // lists and folded groups can't clip it.
  const [place, setPlace] = useState<CSSProperties | null>(null)
  const open = place !== null
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const dropdown = useRef<HTMLDivElement>(null)
  const menuId = useId()

  const show = () => {
    if (!button.current) return
    const r = button.current.getBoundingClientRect()
    // Below the button, unless that would run off the bottom of the window.
    const below = r.bottom + 4 + 40 + items.length * 31 < window.innerHeight
    setPlace({
      position: 'fixed',
      ...(below ? { top: r.bottom + 4 } : { bottom: window.innerHeight - r.top + 4 }),
      ...(align === 'right' ? { right: window.innerWidth - r.right } : { left: r.left }),
    })
  }
  /** Closes the menu; with `restoreFocus`, focus goes back to the button. */
  const close = (restoreFocus = false) => {
    setPlace(null)
    if (restoreFocus) button.current?.focus({ preventScroll: true })
  }

  // The first row takes focus when the menu opens, so the arrow keys work at once.
  useEffect(() => {
    if (open) focusFirstRow(dropdown.current)
  }, [open])

  // Close on outside click or when anything scrolls (it would drift away from
  // its button otherwise). Escape and Tab are handled on the menu itself.
  useEffect(() => {
    if (!open) return
    const hide = () => setPlace(null)
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!root.current?.contains(t) && !dropdown.current?.contains(t)) hide()
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
    }
  }, [open])

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => {
          // Down arrow opens it from the keyboard, as in any menu button.
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault()
            show()
          }
        }}
        className={
          trigger
            ? 'flex'
            : `flex rounded-md p-1.5 transition-colors duration-100 ${open ? 'bg-hover text-fg-2' : 'text-fg-3 hover:bg-hover hover:text-fg-2'}`
        }
      >
        {trigger ?? <Ellipsis {...icon} strokeWidth={2} />}
      </button>
      {place &&
        createPortal(
          // The arrow keys act on the rows inside; the menu itself isn't a tab stop.
           
          <div
            ref={dropdown}
            id={menuId}
            role="menu"
            tabIndex={-1}
            aria-label={label}
            style={place}
            className={MENU_BOX}
            onKeyDown={(e) => onMenuKeyDown(e, close)}
          >
            <MenuItems items={items} onPicked={() => close(true)} />
          </div>,
          document.body,
        )}
    </div>
  )
}

/** The rows of a menu. Shared by the ⋯ menus and the right-click menu (ContextMenu.tsx). */
export function MenuItems({ items, onPicked }: { items: (MenuItem | 'divider')[]; onPicked: () => void }) {
  return (
    <>
      {items.map((item, i) =>
        item === 'divider' ? (
          <div key={`d${i}`} role="separator" className="mx-1.5 my-1 h-px bg-border" />
        ) : (
          <button
            key={item.label}
            role="menuitem"
            tabIndex={-1}
            onClick={() => {
              onPicked()
              item.onSelect()
            }}
            className={`flex h-[30px] items-center gap-2.5 rounded-md px-2.5 text-left transition-colors duration-100 hover:bg-hover focus-visible:bg-hover ${
              item.danger ? 'text-danger' : 'text-fg'
            }`}
          >
            {item.Icon && (
              <item.Icon size={15} strokeWidth={1.75} aria-hidden="true" className={item.danger ? '' : 'text-fg-2'} />
            )}
            <span className="flex-1">{item.label}</span>
            {item.shortcut && <kbd className="font-mono text-label font-normal text-fg-3">{item.shortcut}</kbd>}
          </button>
        ),
      )}
    </>
  )
}

/** Classes for a menu's floating box (⋯ menus and the right-click menu). */
export const MENU_BOX =
  'z-50 flex w-52 origin-top animate-menu-in flex-col gap-px rounded-[10px] border border-border-menu bg-menu p-[5px] shadow-menu'
