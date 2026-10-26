// ⌘K: one small box to find anything and do anything.
//
// Type to filter. Results come in three groups:
//   Actions  go somewhere, create something, change a setting
//   Items    areas, projects, milestones, tasks and pages, by title
//   In text  pages and items whose text contains what you typed
// Arrow keys move, Enter runs, Escape closes. Titles are matched here from the
// snapshot (instant); text is searched by the Rust core (search.rs).

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion, useIsPresent } from 'motion/react'
import { CornerDownLeft, FileText, Folder, Search, Target } from 'lucide-react'
import { searchText, type Item, type TextHit } from '../../platform/api'
import { trailOf } from '../../domain/items'
import { useModalLayer } from '../../shared/a11y/modalLayer'
import { spring } from '../../shared/motion/springs'
import { StatusIcon } from '../../shared/ui'

export interface PaletteAction {
  id: string
  label: string
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>
  /** Extra words that find it ("go", "new", "theme"). */
  keywords?: string
  /** Shortcut shown on the right, e.g. keys('N') from lib/platform. */
  shortcut?: string
  run: () => void
}

type Row =
  | { type: 'action'; key: string; action: PaletteAction }
  | { type: 'item'; key: string; item: Item }
  | { type: 'text'; key: string; item: Item; snippet: string }

/** Lower is better; null means no match. */
function score(text: string, query: string): number | null {
  const t = text.toLowerCase()
  if (t === query) return 0
  if (t.startsWith(query)) return 1
  if (t.split(/[\s/-]+/).some((word) => word.startsWith(query))) return 2
  if (t.includes(query)) return 3
  // Letters in order ("rth" finds "Renovate the house").
  let i = 0
  for (const ch of t) if (ch === query[i]) i++
  return i === query.length && query.length > 1 ? 5 : null
}

const KIND_ORDER: Record<string, number> = { project: 0, area: 1, page: 2, milestone: 3, task: 4 }

export function CommandPalette({
  items,
  actions,
  makeActions,
  onOpenItem,
  onClose,
}: {
  items: Item[]
  /** Always available. */
  actions: PaletteAction[]
  /** Extra actions built from what you typed ("Add “…” to Unsorted"). */
  makeActions: (query: string) => PaletteAction[]
  onOpenItem: (item: Item) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const [textHits, setTextHits] = useState<{ query: string; hits: TextHit[] }>({ query: '', hits: [] })
  const list = useRef<HTMLDivElement>(null)
  const highlightId = useId()
  const listId = useId()
  const dialog = useRef<HTMLDivElement>(null)
  // Focus, Escape, the inert page behind: see lib/modalLayer.ts. Released as
  // soon as the exit animation starts, so a command that moves focus can.
  useModalLayer(dialog, onClose, useIsPresent())
  const q = query.trim().toLowerCase()
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])

  // Text search, a moment after typing stops.
  useEffect(() => {
    if (q.length < 2) return
    let current = true
    const timer = window.setTimeout(() => {
      searchText(q)
        .then((hits) => current && setTextHits({ query: q, hits }))
        .catch(() => current && setTextHits({ query: q, hits: [] }))
    }, 120)
    return () => {
      current = false
      window.clearTimeout(timer)
    }
  }, [q])

  const groups = useMemo(() => {
    const out: { label: string; rows: Row[] }[] = []
    // Actions: everything when empty; matches (plus typed-text actions) otherwise.
    const actionRows: Row[] = (
      q
        ? [
            ...actions
              .map((a) => ({ a, s: Math.min(score(a.label, q) ?? 9, score(a.keywords ?? '', q) ?? 9) }))
              .filter((x) => x.s < 9)
              .sort((x, y) => x.s - y.s)
              .slice(0, 4)
              .map((x) => x.a),
            ...makeActions(query.trim()),
          ]
        : actions
    ).map((action) => ({ type: 'action', key: `a:${action.id}`, action }))

    // Items by title. Done tasks rank last.
    const itemRows: Row[] = q
      ? items
          .map((item) => {
            const s = score(item.title, q)
            return s === null ? null : { item, s: s + (item.status === 'done' ? 4 : 0) }
          })
          .filter((x): x is { item: Item; s: number } => x !== null)
          .sort((x, y) => x.s - y.s || KIND_ORDER[x.item.kind] - KIND_ORDER[y.item.kind])
          .slice(0, 8)
          .map(({ item }) => ({ type: 'item', key: `i:${item.id}`, item }))
      : []

    const shown = new Set(itemRows.map((r) => (r.type === 'item' ? r.item.id : '')))
    const textRows: Row[] =
      q.length >= 2 && textHits.query === q
        ? textHits.hits
            .filter((h) => !shown.has(h.id) && byId.has(h.id))
            .slice(0, 6)
            .map((h) => ({ type: 'text', key: `t:${h.id}`, item: byId.get(h.id)!, snippet: h.snippet }))
        : []

    // When searching, items come first: that's usually what you're after.
    if (q && itemRows.length) out.push({ label: 'Items', rows: itemRows })
    if (actionRows.length) out.push({ label: 'Actions', rows: actionRows })
    if (textRows.length) out.push({ label: 'In text', rows: textRows })
    return out
  }, [q, query, actions, makeActions, items, textHits, byId])

  const rows = groups.flatMap((g) => g.rows)
  const selected = Math.min(index, Math.max(rows.length - 1, 0))

  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${selected}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const run = (row: Row | undefined) => {
    if (!row) return
    onClose()
    if (row.type === 'action') row.action.run()
    else onOpenItem(row.item)
  }

  let n = -1
  return createPortal(
    // The backdrop is only a click target for pointer users; keyboard users close with Escape.
    <div role="presentation" className="fixed inset-0 z-40" onMouseDown={onClose}>
      <motion.div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.97, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: -4, transition: { duration: 0.1 } }}
        transition={spring.snappy}
        onMouseDown={(e) => e.stopPropagation()}
        className="absolute top-[14vh] left-1/2 flex w-[560px] max-w-[calc(100vw-32px)] -translate-x-1/2 flex-col overflow-hidden rounded-panel border border-border-menu bg-menu shadow-window outline-none"
      >
        <div className="flex h-12 items-center gap-2.5 border-b border-border px-4">
          <Search size={16} strokeWidth={1.75} className="shrink-0 text-fg-3" aria-hidden="true" />
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={rows.length ? `${listId}-${selected}` : undefined}
            value={query}
            onChange={(e) => {
              setQuery(e.currentTarget.value)
              setIndex(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                if (!rows.length) return
                const step = e.key === 'ArrowDown' ? 1 : -1
                setIndex((selected + step + rows.length) % rows.length)
              } else if (e.key === 'Enter') {
                e.preventDefault()
                run(rows[selected])
              }
              // Escape is handled by the dialog (lib/modalLayer.ts).
            }}
            placeholder="Search or run a command"
            aria-label="Search or run a command"
            className="h-full flex-1 bg-transparent text-[15px] outline-none placeholder:text-placeholder"
          />
          <kbd className="font-mono text-label font-normal text-fg-3">esc</kbd>
        </div>

        {/* Never scrolls sideways: the sliding highlight can poke out for a
            frame while it moves between rows of different heights. */}
        <div ref={list} id={listId} role="listbox" aria-label="Results" className="flex max-h-[min(380px,60vh)] flex-col overflow-x-hidden overflow-y-auto p-1.5">
          {groups.map((group) => (
            <div key={group.label} role="group" aria-label={group.label} className="flex flex-col">
              <div aria-hidden="true" className="px-2.5 pt-2 pb-1 text-label tracking-label text-fg-3 uppercase">
                {group.label}
              </div>
              {group.rows.map((row) => {
                n++
                const i = n
                return (
                  <button
                    key={row.key}
                    id={`${listId}-${i}`}
                    data-index={i}
                    role="option"
                    tabIndex={-1}
                    aria-selected={i === selected}
                    onMouseMove={() => i !== selected && setIndex(i)}
                    onClick={() => run(row)}
                    className="relative flex min-h-9 shrink-0 items-center gap-2.5 rounded-control px-2.5 py-1.5 text-left"
                  >
                    {i === selected && (
                      <motion.span layoutId={highlightId} transition={spring.snappy} className="absolute inset-0 rounded-control bg-hover" />
                    )}
                    <RowContent row={row} items={items} selected={i === selected} />
                  </button>
                )
              })}
            </div>
          ))}
          {rows.length === 0 && <p className="px-3 py-6 text-center text-fg-3">Nothing found</p>}
        </div>
        {/* Said aloud as the results change. */}
        <div role="status" className="sr-only">
          {rows.length === 0 ? 'No results' : `${rows.length} ${rows.length === 1 ? 'result' : 'results'}`}
        </div>
      </motion.div>
    </div>,
    document.body,
  )
}

function RowContent({ row, items, selected }: { row: Row; items: Item[]; selected: boolean }) {
  if (row.type === 'action') {
    const { Icon, label, shortcut } = row.action
    return (
      <>
        <Icon size={15} strokeWidth={1.75} className="relative shrink-0 text-fg-2" />
        <span className="relative flex-1 truncate">{label}</span>
        {shortcut && <kbd className="relative font-mono text-label font-normal text-fg-3">{shortcut}</kbd>}
        <Enter show={selected && !shortcut} />
      </>
    )
  }
  const { item } = row
  const trail = trailOf(items, item.id)
    .slice(0, -1)
    .map((p) => p.title)
    .join(' / ')
  return (
    <>
      <span className="relative flex w-[15px] shrink-0 justify-center text-fg-2">
        <KindIcon item={item} />
      </span>
      <span className="relative flex min-w-0 flex-1 flex-col">
        <span className={`truncate ${item.status === 'done' ? 'text-fg-3 line-through' : ''}`}>{item.title}</span>
        {row.type === 'text' ? (
          <span className="truncate text-label font-normal text-fg-3">{row.snippet}</span>
        ) : (
          trail && <span className="truncate text-label font-normal text-fg-3">{trail}</span>
        )}
      </span>
      <Enter show={selected} />
    </>
  )
}

function KindIcon({ item }: { item: Item }): ReactNode {
  switch (item.kind) {
    case 'area':
      return <Folder size={15} strokeWidth={1.75} aria-hidden="true" />
    case 'project':
      return <Target size={15} strokeWidth={1.75} aria-hidden="true" />
    case 'milestone':
      // Milestones are chips, never icons: show a tiny swatch of its color.
      return (
        <span
          className="milestone-chip size-[11px] rounded-[3px] p-0"
          style={{ '--ms': `var(--color-ms-${item.color ?? 'sand'})` } as React.CSSProperties}
        />
      )
    case 'task':
      return <StatusIcon status={item.status} size={15} />
    default:
      return item.icon ? (
        <span className="text-lead leading-none" aria-hidden="true">
          {item.icon}
        </span>
      ) : (
        <FileText size={15} strokeWidth={1.75} aria-hidden="true" />
      )
  }
}

function Enter({ show }: { show: boolean }) {
  return (
    <CornerDownLeft
      size={13}
      strokeWidth={2}
      aria-hidden="true"
      className={`key-hint relative shrink-0 text-fg-3 transition-opacity duration-100 ${show ? 'opacity-100' : 'opacity-0'}`}
    />
  )
}
