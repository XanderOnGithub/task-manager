// Interactive building blocks: inline inputs, menus, modals, segmented controls.

import { lazy, Suspense, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import { spring } from '../lib/motion'
import { Ellipsis, Plus, X, type LucideIcon } from 'lucide-react'
import type { Item } from '../lib/api'
import { icon } from '../lib/items'
import { metaPath, useBodyRevision } from '../lib/bodyChanges'
import { useToast } from '../lib/toast'
import { useBody } from '../lib/useBody'
import type { TextStats } from './MarkdownEditor'

// ---------------------------------------------------------------------------
// Inline add: a quiet "+ Add a task" row that turns into a text field.
// ---------------------------------------------------------------------------

export function InlineAdd({
  id,
  label,
  onAdd,
  onDone,
  autoFocus = false,
  className = '',
}: {
  /** Lets other buttons focus this field (e.g. "+ Task" in the header). */
  id?: string
  label: string
  onAdd: (title: string) => Promise<unknown>
  /** Called on Escape, or when the field loses focus while empty. */
  onDone?: () => void
  autoFocus?: boolean
  className?: string
}) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const title = value.trim()
    if (!title || busy) return
    setBusy(true)
    await onAdd(title)
    setBusy(false)
    setValue('') // stays focused, ready for the next one
  }

  return (
    <label
      className={`group flex h-8 items-center gap-2 rounded-control border border-dashed border-transparent px-2 text-placeholder transition-colors duration-100 focus-within:border-border-dashed focus-within:text-fg-3 hover:text-fg-3 ${className}`}
    >
      <Plus size={15} strokeWidth={1.75} aria-hidden="true" />
      <input
        id={id}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => !value.trim() && onDone?.()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submit()
          if (e.key === 'Escape') {
            setValue('')
            e.currentTarget.blur()
            onDone?.()
          }
        }}
        placeholder={label}
        aria-label={label}
        className="min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-placeholder group-hover:placeholder:text-fg-3"
      />
      {value && <kbd className="font-mono text-label font-normal">↵</kbd>}
    </label>
  )
}

// ---------------------------------------------------------------------------
// Editable title: looks like text, becomes a field on click.
// ---------------------------------------------------------------------------

export function EditableTitle({
  value,
  onSave,
  className = '',
  editing: startEditing = false,
}: {
  value: string
  onSave: (title: string) => Promise<unknown>
  className?: string
  editing?: boolean
}) {
  const [draft, setDraft] = useState<string | null>(startEditing ? value : null)

  // Reads the field itself, not state, so the last keystrokes are never lost.
  const commit = async (text: string) => {
    const title = text.trim()
    setDraft(null)
    if (title && title !== value) await onSave(title)
  }

  if (draft === null) {
    return (
      <button
        onClick={() => setDraft(value)}
        title="Rename"
        className={`-mx-1 rounded-control px-1 text-left transition-colors duration-100 hover:bg-hover ${className}`}
      >
        {value}
      </button>
    )
  }
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => void commit(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') setDraft(null)
      }}
      aria-label="Title"
      className={`-mx-1 rounded-control bg-hover px-1 outline-none ${className}`}
    />
  )
}

// ---------------------------------------------------------------------------
// Menu: the ⋯ button and its dropdown.
// ---------------------------------------------------------------------------

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

  const toggle = () => {
    if (open || !button.current) return setPlace(null)
    const r = button.current.getBoundingClientRect()
    // Below the button, unless that would run off the bottom of the window.
    const below = r.bottom + 4 + 40 + items.length * 31 < window.innerHeight
    setPlace({
      position: 'fixed',
      ...(below ? { top: r.bottom + 4 } : { bottom: window.innerHeight - r.top + 4 }),
      ...(align === 'right' ? { right: window.innerWidth - r.right } : { left: r.left }),
    })
  }

  // Close on outside click, Escape, or when anything scrolls (it would drift
  // away from its button otherwise).
  useEffect(() => {
    if (!open) return
    const close = () => setPlace(null)
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!root.current?.contains(t) && !dropdown.current?.contains(t)) close()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
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
          <div
            ref={dropdown}
            role="menu"
            style={place}
            className={MENU_BOX}
          >
            <MenuItems items={items} onPicked={() => setPlace(null)} />
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
          <div key={`d${i}`} className="mx-1.5 my-1 h-px bg-border" />
        ) : (
          <button
            key={item.label}
            role="menuitem"
            onClick={() => {
              onPicked()
              item.onSelect()
            }}
            className={`flex h-[30px] items-center gap-2.5 rounded-md px-2.5 text-left transition-colors duration-100 hover:bg-hover ${
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
const MENU_BOX =
  'z-50 flex w-52 origin-top animate-menu-in flex-col gap-px rounded-[10px] border border-border-menu bg-menu p-[5px] shadow-menu'

// ---------------------------------------------------------------------------
// Right-click menu
// ---------------------------------------------------------------------------

/**
 * Replaces the web view's own right-click menu (Reload, Inspect, Back) with
 * ours. Mount once. `menuFor` gets what was right-clicked and returns the
 * menu for it (usually the item's ⋯ menu), or null for no menu at all.
 *
 * Text fields and the page editor keep the system menu, which has cut, copy,
 * paste and spelling. In development, Shift-right-click shows the web view's
 * menu too, for Inspect Element.
 */
export function ContextMenu({ menuFor }: { menuFor: (target: HTMLElement) => (MenuItem | 'divider')[] | null }) {
  const [menu, setMenu] = useState<{ x: number; y: number; items: (MenuItem | 'divider')[] } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const lookup = useRef(menuFor)
  lookup.current = menuFor

  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (import.meta.env.DEV && e.shiftKey) return
      if (target.closest('input, textarea, [contenteditable="true"]')) return
      e.preventDefault()
      const items = lookup.current(target)
      setMenu(items && items.length > 0 ? { x: e.clientX, y: e.clientY, items } : null)
    }
    window.addEventListener('contextmenu', onContextMenu)
    return () => window.removeEventListener('contextmenu', onContextMenu)
  }, [])

  // Close on a click elsewhere, Escape, scrolling or resizing.
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && close()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
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
    <div ref={box} role="menu" style={style} className={MENU_BOX}>
      <MenuItems items={menu.items} onPicked={() => setMenu(null)} />
    </div>,
    document.body,
  )
}

// ---------------------------------------------------------------------------
// Segmented control (List / Board, Task / Page / Project, statuses).
// ---------------------------------------------------------------------------

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  size = 'md',
  iconsOnly = false,
}: {
  label: string
  options: { value: T; label: string; icon?: ReactNode }[]
  value: T | null
  onChange: (value: T) => void
  size?: 'sm' | 'md'
  /** Show only the icons (labels become tooltips and stay readable by screen readers). */
  iconsOnly?: boolean
}) {
  // The selected background is one element that slides between options.
  const thumbId = useId()
  return (
    <div role="radiogroup" aria-label={label} className="flex w-fit gap-0.5 rounded-row bg-raised p-0.5">
      {options.map((option) => {
        const on = option.value === value
        return (
          <button
            key={option.value}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(option.value)}
            title={option.icon ? option.label : undefined}
            aria-label={iconsOnly ? option.label : undefined}
            className={`relative flex items-center gap-1.5 rounded-md transition-colors duration-100 ${
              iconsOnly ? (size === 'sm' ? 'h-6 px-1.5' : 'h-[26px] px-2') : size === 'sm' ? 'h-6 px-2.5 text-meta' : 'h-[26px] px-3 text-[12.5px] font-medium'
            } ${on ? 'text-fg' : 'text-fg-2 hover:text-fg'}`}
          >
            {on && (
              <motion.span
                layoutId={thumbId}
                transition={spring.snappy}
                className="absolute inset-0 rounded-md bg-seg-on shadow-seg"
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {option.icon}
              {/* In a narrow panel header, options with an icon show just the icon. */}
              <span className={iconsOnly ? 'sr-only' : option.icon ? '@max-[34rem]/header:sr-only' : ''}>{option.label}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modal: centered dialog over a dimmed window.
// ---------------------------------------------------------------------------

export function Modal({
  label,
  onClose,
  children,
  width = 'w-[480px]',
}: {
  label: string
  onClose: () => void
  children: ReactNode
  width?: string
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-start justify-center bg-scrim pt-[18vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-label={label}
        className={`${width} animate-menu-in rounded-panel border border-border-menu bg-menu shadow-window`}
      >
        {children}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Body editor: the text under an item's frontmatter, saved when you click away.
// Plain text for now; a markdown preview comes with the notes editor (M6).
// ---------------------------------------------------------------------------

// The editor is a big chunk of code; load it the first time something is opened.
const MarkdownEditor = lazy(() => import('./MarkdownEditor').then((m) => ({ default: m.MarkdownEditor })))

export function BodyEditor({
  item,
  onSave,
  placeholder,
  tone = 'muted',
  className = '',
  onCreatePage,
  onOpenPage,
  onStats,
}: {
  item: Item
  onSave: (body: string) => Promise<unknown>
  placeholder: string
  /** 'muted' for descriptions under a title, 'normal' for a page's main text. */
  tone?: 'muted' | 'normal'
  className?: string
  /** Pages only: "/page" makes a subpage (see MarkdownEditor). */
  onCreatePage?: (title: string) => Promise<string | null>
  onOpenPage?: (href: string) => void
  /** Pages only: word and character counts as you type. */
  onStats?: (stats: TextStats) => void
}) {
  const toast = useToast()
  // Reads the text again if its file changed outside the app (a sync, another editor).
  const body = useBody(item.id, useBodyRevision(metaPath(item)))
  // Nothing until the text has loaded, so the editor never starts empty and
  // then jumps. One editor per item (the key), so undo history doesn't mix.
  const loading = <div className={className} aria-busy="true" />
  if (body.status === 'loading') return loading
  // A failed read is not an empty page: an empty editor would let the next
  // edit replace the real text.
  if (body.status === 'error') {
    return (
      <div role="alert" className={`flex flex-col items-start gap-2 text-meta font-normal text-fg-2 ${className}`}>
        <span>Couldn't read this text. {body.message}</span>
        <button
          onClick={body.retry}
          className="rounded-control bg-raised px-3 py-1 text-fg transition-colors duration-100 hover:bg-hover"
        >
          Try again
        </button>
      </div>
    )
  }
  return (
    <Suspense fallback={loading}>
      <MarkdownEditor
        key={item.id}
        value={body.body}
        onSave={onSave}
        onSaveError={(e) => toast({ message: `Couldn't save. Moss will keep trying. ${String(e)}`, tone: 'error' })}
        placeholder={placeholder}
        label={tone === 'muted' ? 'Description' : 'Page text'}
        className={`${tone === 'muted' ? 'text-fg-2' : 'text-fg'} ${className}`}
        onCreatePage={onCreatePage}
        onOpenPage={onOpenPage}
        onStats={onStats}
      />
    </Suspense>
  )
}

// ---------------------------------------------------------------------------
// Date field: "Add a due date" until there is one, then the system date picker.
// ---------------------------------------------------------------------------

export function DateField({
  value,
  onChange,
  label,
}: {
  value: string | null
  onChange: (date: string | null) => void
  label: string
}) {
  const [editing, setEditing] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) return
    input.current?.focus()
    try {
      input.current?.showPicker()
    } catch {
      // Not every web view can open the picker from code; the field is focused anyway.
    }
  }, [editing])

  if (!value && !editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="-mx-1.5 h-7 rounded-control px-1.5 text-placeholder transition-colors duration-100 hover:bg-hover hover:text-fg-3"
      >
        Add a due date
      </button>
    )
  }
  return (
    <span className="flex items-center gap-1">
      <input
        ref={input}
        type="date"
        value={value ?? ''}
        onChange={(e) => {
          onChange(e.target.value || null)
          if (e.target.value) setEditing(false)
        }}
        onBlur={() => setEditing(false)}
        aria-label={label}
        className="-mx-1.5 h-7 rounded-control bg-transparent px-1.5 text-[12.5px] text-fg outline-none transition-colors duration-100 hover:bg-hover focus:bg-hover"
      />
      {value && (
        <button
          onClick={() => onChange(null)}
          aria-label={`Clear ${label.toLowerCase()}`}
          title="Clear"
          className="flex rounded-md p-1 text-fg-3 transition-colors duration-100 hover:bg-hover hover:text-fg-2"
        >
          <X size={13} strokeWidth={2} aria-hidden="true" />
        </button>
      )}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Switch: an on/off toggle whose knob slides.
// ---------------------------------------------------------------------------

export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex h-[18px] w-8 shrink-0 items-center rounded-full p-0.5 transition-colors duration-150 disabled:opacity-50 ${
        checked ? 'justify-end bg-accent' : 'justify-start bg-border-strong'
      }`}
    >
      <motion.span layout transition={spring.pop} className="size-3.5 rounded-full bg-fg shadow-seg" />
    </button>
  )
}
