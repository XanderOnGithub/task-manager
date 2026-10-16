// The editor's floating menus, drawn over everything (portal to <body>):
// - SelectionToolbar: appears above selected text. Bold, italic, strike,
//   code, link.
// - SlashMenu: appears under the caret after typing "/". Arrow keys move,
//   Enter picks, Escape closes; typing filters it.
// Both pop from where you're typing, and the highlight slides between items.

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import { Bold, Code, CornerDownLeft, Italic, Link, Strikethrough } from 'lucide-react'
import { spring } from '../../lib/motion'
import type { Block } from './blocks'

export interface ToolbarState {
  /** Middle of the selection, top edge (viewport px). */
  x: number
  y: number
  active: { strong: boolean; em: boolean; strike: boolean; code: boolean; link: boolean }
}

export interface SlashState {
  /** Range of the typed "/query" in the document. */
  from: number
  to: number
  query: string
  /** Caret position (viewport px). */
  x: number
  top: number
  bottom: number
}

export type MarkAction = 'strong' | 'em' | 'strike' | 'code'

const pop = {
  initial: { opacity: 0, scale: 0.96, y: 4 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.98, y: 2, transition: { duration: 0.08 } },
  transition: spring.snappy,
}

// ---------------------------------------------------------------------------
// Selection toolbar
// ---------------------------------------------------------------------------

export function SelectionToolbar({
  state,
  onMark,
  onLink,
}: {
  state: ToolbarState
  onMark: (mark: MarkAction) => void
  /** null removes the link. */
  onLink: (href: string | null) => void
}) {
  const [linking, setLinking] = useState(false)
  const [href, setHref] = useState('')

  return createPortal(
    <motion.div
      {...pop}
      role="toolbar"
      aria-label="Format text"
      // Keep the text selected: don't let clicks here move focus out of the editor.
      onMouseDown={(e) => {
        if (!(e.target as HTMLElement).closest('input')) e.preventDefault()
      }}
      style={{ left: state.x, top: state.y, originX: 0.5, originY: 1 }}
      className="fixed z-50 -translate-x-1/2 -translate-y-[calc(100%+8px)] rounded-card border border-border-menu bg-menu p-1 shadow-menu"
    >
      {linking ? (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault()
            const url = href.trim()
            if (url) onLink(/^[a-z]+:/i.test(url) ? url : `https://${url}`)
            setLinking(false)
          }}
        >
          <input
            autoFocus
            value={href}
            onChange={(e) => setHref(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Escape' && setLinking(false)}
            placeholder="Paste a link"
            aria-label="Link address"
            className="h-7 w-56 rounded-control bg-field px-2 text-[13px] outline-none placeholder:text-placeholder"
          />
          <ToolButton label="Add link" type="submit">
            <CornerDownLeft size={14} strokeWidth={2} aria-hidden="true" />
          </ToolButton>
        </form>
      ) : (
        <div className="flex items-center gap-0.5">
          <ToolButton label="Bold (⌘B)" active={state.active.strong} onClick={() => onMark('strong')}>
            <Bold size={15} strokeWidth={2.25} aria-hidden="true" />
          </ToolButton>
          <ToolButton label="Italic (⌘I)" active={state.active.em} onClick={() => onMark('em')}>
            <Italic size={15} strokeWidth={2} aria-hidden="true" />
          </ToolButton>
          <ToolButton label="Strikethrough" active={state.active.strike} onClick={() => onMark('strike')}>
            <Strikethrough size={15} strokeWidth={2} aria-hidden="true" />
          </ToolButton>
          <ToolButton label="Code" active={state.active.code} onClick={() => onMark('code')}>
            <Code size={15} strokeWidth={2} aria-hidden="true" />
          </ToolButton>
          <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
          <ToolButton
            label={state.active.link ? 'Remove link' : 'Link'}
            active={state.active.link}
            onClick={() => (state.active.link ? onLink(null) : (setHref(''), setLinking(true)))}
          >
            <Link size={15} strokeWidth={2} aria-hidden="true" />
          </ToolButton>
        </div>
      )}
    </motion.div>,
    document.body,
  )
}

function ToolButton({
  label,
  active = false,
  onClick,
  type = 'button',
  children,
}: {
  label: string
  active?: boolean
  onClick?: () => void
  type?: 'button' | 'submit'
  children: ReactNode
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`flex size-7 items-center justify-center rounded-control transition-[color,background-color,transform] duration-100 active:scale-90 ${
        active ? 'bg-selected text-accent' : 'text-fg-2 hover:bg-hover hover:text-fg'
      }`}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Slash menu
// ---------------------------------------------------------------------------

export function SlashMenu({
  state,
  blocks,
  index,
  onHover,
  onPick,
  naming,
  onName,
  onCancelName,
}: {
  state: SlashState
  blocks: Block[]
  index: number
  onHover: (index: number) => void
  onPick: (block: Block) => void
  /** True while asking for a new page's name. */
  naming: boolean
  onName: (title: string) => void
  onCancelName: () => void
}) {
  const id = useId()
  const list = useRef<HTMLDivElement>(null)
  const [title, setTitle] = useState('')
  // Open downward unless the caret is near the bottom of the window.
  const below = window.innerHeight - state.bottom > 340

  // Keep the highlighted item in view as the arrow keys move it.
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [index])

  return createPortal(
    <motion.div
      {...pop}
      initial={{ opacity: 0, scale: 0.96, y: below ? -4 : 4 }}
      onMouseDown={(e) => {
        if (!(e.target as HTMLElement).closest('input')) e.preventDefault()
      }}
      style={{
        left: Math.min(state.x - 8, window.innerWidth - 276),
        top: below ? state.bottom + 6 : undefined,
        bottom: below ? undefined : window.innerHeight - state.top + 6,
        originX: 0,
        originY: below ? 0 : 1,
      }}
      className="fixed z-50 w-[260px] overflow-hidden rounded-card border border-border-menu bg-menu shadow-menu"
    >
      {naming ? (
        <form
          className="flex flex-col gap-1.5 p-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (title.trim()) onName(title.trim())
          }}
        >
          <span className="px-1 text-label tracking-label text-fg-3 uppercase">New page</span>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Escape' && onCancelName()}
            placeholder="Page name"
            aria-label="Page name"
            className="h-8 rounded-control bg-field px-2 outline-none placeholder:text-placeholder"
          />
        </form>
      ) : blocks.length === 0 ? (
        <p className="px-3 py-2.5 text-fg-3">No matching blocks</p>
      ) : (
        <div ref={list} role="listbox" aria-label="Insert a block" className="flex max-h-[300px] flex-col overflow-y-auto p-1">
          {blocks.map((block, i) => (
            <button
              key={block.id}
              data-index={i}
              role="option"
              aria-selected={i === index}
              onMouseMove={() => i !== index && onHover(i)}
              onClick={() => onPick(block)}
              className="relative flex h-10 shrink-0 items-center gap-2.5 rounded-control px-2 text-left"
            >
              {i === index && (
                <motion.span layoutId={`slash-${id}`} transition={spring.snappy} className="absolute inset-0 rounded-control bg-hover" />
              )}
              <span className="relative flex size-7 items-center justify-center rounded-[6px] border border-border bg-panel text-fg-2">
                <block.Icon size={15} strokeWidth={1.75} aria-hidden="true" />
              </span>
              <span className="relative flex min-w-0 flex-col">
                <span className="leading-tight text-fg">{block.label}</span>
                <span className="truncate text-label font-normal text-fg-3">{block.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </motion.div>,
    document.body,
  )
}
