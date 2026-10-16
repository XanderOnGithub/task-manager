// Pages in the sidebar tree: rows, nesting, and dragging them around.
//
// Pages belong to an area or a project and nest to any depth, so instead of
// sliding rows aside (like the task lists do) a drop has three zones on the
// page under it:
//   top quarter    → put it above that page (same level)
//   middle         → make it a subpage of that page
//   bottom quarter → put it below that page (same level)
// Dropping on an area or project row puts the page in that area's or
// project's pages (at the end). A thin line shows "above/below" at the right
// indent; a soft highlight shows "inside".
//
// The sidebar has one DndContext for everything (AreaTree.tsx). This file
// gives it the rows (`PageRows`); the drag logic is in lib/pageDrag.ts.

import { useContext, useState, type ReactNode } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { motion } from 'motion/react'
import { ChevronDown, Ellipsis, FilePlus, FileText } from 'lucide-react'
import { childrenOf, type Item } from '../lib/api'
import { spring } from '../lib/motion'
import { INDENT, PageDropContext, TOGGLE } from '../lib/pageDrag'
import type { Actions } from '../lib/useActions'
import type { Adding } from './AreaTree'
import { InlineAdd, Menu } from './controls'
import { itemMenu } from './itemMenu'
import { Collapse } from './motion'

/** What page rows need for their ⋯ menu: changing pages and the sidebar's inline "add" field. */
export interface PageRowTools {
  actions: Actions
  adding: Adding
  setAdding: (adding: Adding) => void
  /** Creates a page (or area / project) and opens it. */
  onAdd: (kind: 'area' | 'project' | 'page', parent: string | null, title: string) => Promise<unknown>
}

/**
 * The pages under `parent` (an area, project or page), nested. `indent` is
 * the left padding of the first level, so the icons line up with the rows
 * around them.
 */
export function PageRows({
  items,
  parent,
  indent,
  openId,
  onOpen,
  collapsed,
  onToggle,
  tools,
}: {
  items: Item[]
  parent: string
  indent: number
  openId: string | null
  onOpen: (id: string) => void
  /** Pages whose subpages are folded away. */
  collapsed: Set<string>
  onToggle: (id: string) => void
  tools: PageRowTools
}) {
  return (
    <ul className="flex flex-col gap-0.5">
      {childrenOf(items, parent, true).map((page) => {
        const hasChildren = items.some((i) => i.parent === page.id)
        // A subpage being added here opens the page so the field shows.
        const addingHere = tools.adding?.kind === 'page' && tools.adding.parent === page.id
        const open = !collapsed.has(page.id) || addingHere
        return (
          <li key={page.id}>
            <PageRow
              page={page}
              indent={indent}
              active={page.id === openId}
              onOpen={onOpen}
              tools={tools}
              toggle={hasChildren ? <FoldButton title={page.title} open={open} onClick={() => onToggle(page.id)} /> : null}
            />
            {(hasChildren || addingHere) && (
              <Collapse open={open}>
                <PageRows
                  items={items}
                  parent={page.id}
                  indent={indent + INDENT}
                  openId={openId}
                  onOpen={onOpen}
                  collapsed={collapsed}
                  onToggle={onToggle}
                  tools={tools}
                />
                {addingHere && (
                  <div style={{ marginLeft: indent + INDENT + TOGGLE - 8 }}>
                    <InlineAdd
                      autoFocus
                      label="Subpage name"
                      className="h-7"
                      onAdd={async (title) => {
                        await tools.onAdd('page', page.id, title)
                        tools.setAdding(null)
                      }}
                      onDone={() => tools.setAdding(null)}
                    />
                  </div>
                )}
              </Collapse>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function PageRow({
  page,
  indent,
  active,
  onOpen,
  toggle,
  tools,
}: {
  page: Item
  indent: number
  active: boolean
  onOpen: (id: string) => void
  toggle: ReactNode
  tools: PageRowTools
}) {
  const { activeId, target } = useContext(PageDropContext)
  const [renaming, setRenaming] = useState(false)
  const draggable = useDraggable({ id: page.id, data: { type: 'page' } })
  const droppable = useDroppable({ id: page.id, data: { type: 'page' } })
  const zone = target?.id === page.id && activeId !== page.id ? target.zone : null

  return (
    <div
      ref={(el) => {
        draggable.setNodeRef(el)
        droppable.setNodeRef(el)
      }}
      {...draggable.attributes}
      {...draggable.listeners}
      aria-label={`${page.title}, page. Press space to move.`}
      className={`group/page relative flex h-7 items-center gap-1 rounded-control pr-7 transition-colors duration-100 ${
        draggable.isDragging
          ? 'bg-hover [&>*]:invisible'
          : zone === 'inside'
            ? 'bg-selected'
            : active
              ? 'font-medium text-fg'
              : 'text-fg-2 hover:bg-hover hover:text-fg'
      }`}
      style={{ paddingLeft: indent }}
    >
      {/* The same sliding highlight as areas and projects. */}
      {active && !draggable.isDragging && <SidebarHighlight />}
      <span className="relative flex w-[17px] justify-center">{toggle}</span>
      {renaming ? (
        // Rename in place: Enter or clicking away saves, Escape cancels.
        <span className="relative flex h-full min-w-0 flex-1 items-center gap-2">
          <PageIcon page={page} />
          <input
            autoFocus
            defaultValue={page.title}
            aria-label="Page name"
            onFocus={(e) => e.currentTarget.select()}
            // Keys typed here belong to the field, not the drag handle on the row.
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') setRenaming(false)
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onBlur={(e) => {
              const title = e.currentTarget.value.trim()
              setRenaming(false)
              if (title && title !== page.title) void tools.actions.rename(page, title)
            }}
            className="-mx-1 h-6 min-w-0 flex-1 rounded-chip bg-field px-1 text-fg outline-none"
          />
        </span>
      ) : (
        <button onClick={() => onOpen(page.id)} className="relative flex h-full min-w-0 flex-1 items-center gap-2 text-left">
          <PageIcon page={page} />
          <span className="truncate">{page.title}</span>
        </button>
      )}
      {/* ⋯ on hover (and while its menu is open). */}
      {!renaming && (
        <span className="absolute top-1 right-1 opacity-0 transition-opacity duration-100 group-hover/page:opacity-100 focus-within:opacity-100 has-[[aria-expanded=true]]:opacity-100">
          <Menu
            label={`More actions for ${page.title}`}
            trigger={<MoreIcon />}
            items={[
              { label: 'Add a subpage', Icon: FilePlus, onSelect: () => tools.setAdding({ kind: 'page', parent: page.id }) },
              'divider',
              ...itemMenu(page, tools.actions, () => setRenaming(true)),
            ]}
          />
        </span>
      )}
      {/* Where it will land: a line above or below, at this page's indent. */}
      {(zone === 'before' || zone === 'after') && <DropLine at={zone} left={indent + TOGGLE - 1} />}
    </div>
  )
}

/** The small ⋯ used as a row's menu button. */
function MoreIcon() {
  return (
    <span className="flex rounded-md p-0.5 text-fg-3 hover:bg-hover hover:text-fg-2">
      <Ellipsis size={14} strokeWidth={2} aria-hidden="true" />
    </span>
  )
}

/** The chevron that folds a row's children. */
export function FoldButton({ title, open, onClick }: { title: string; open: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
      aria-expanded={open}
      className="flex rounded p-0.5 text-fg-3 hover:text-fg-2"
    >
      <motion.span initial={false} animate={{ rotate: open ? 0 : -90 }} transition={spring.snappy} className="flex">
        <ChevronDown size={13} strokeWidth={2} aria-hidden="true" />
      </motion.span>
    </button>
  )
}

/** The accent line that shows where a dragged page will land. */
function DropLine({ at, left }: { at: 'before' | 'after'; left: number }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute right-1 h-0.5 rounded-full bg-accent ${
        at === 'before' ? '-top-[2px]' : '-bottom-[2px]'
      }`}
      style={{ left }}
    />
  )
}

/** One highlight that slides to whatever is open in the sidebar tree. */
export function SidebarHighlight() {
  return (
    <motion.span layoutId="sidebar-open" transition={spring.snappy} className="absolute inset-0 rounded-control bg-selected" />
  )
}

/** A page's emoji if it has one, else the page icon. Same 15px slot either way. */
export function PageIcon({ page, className = 'text-fg-2' }: { page: Item; className?: string }) {
  return page.icon ? (
    <span className="flex w-[15px] shrink-0 justify-center text-[14px] leading-none" aria-hidden="true">
      {page.icon}
    </span>
  ) : (
    <FileText size={15} strokeWidth={1.75} className={`shrink-0 ${className}`} aria-hidden="true" />
  )
}
