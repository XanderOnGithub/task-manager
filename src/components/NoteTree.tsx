// The Docs page tree, draggable.
//
// Pages nest to any depth, so instead of sliding rows aside (like the task
// lists do) a drop has three zones on the page under it:
//   top quarter    → put it above that page (same level)
//   middle         → make it a subpage of that page
//   bottom quarter → put it below that page (same level)
// A thin line shows "above/below" at the right indent; a soft highlight shows
// "subpage". The dragged page swings under the pointer like everywhere else.

import { createContext, useContext, useState, type ReactNode } from 'react'
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragMoveEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import { motion } from 'motion/react'
import { ChevronDown, FileText } from 'lucide-react'
import { childrenOf, type Item } from '../lib/api'
import { dropSettle, useDragState } from '../lib/drag'
import { spring } from '../lib/motion'
import type { Actions } from '../lib/useActions'
import { Lifted } from './Lifted'
import { Collapse } from './motion'

type Zone = 'before' | 'inside' | 'after'
interface Target {
  id: string
  zone: Zone
}

/** Indent per level, in px. */
const INDENT = 16

/** Shared with every row: what's being dragged and where it would land. */
const DropContext = createContext<{ activeId: string | null; target: Target | null }>({
  activeId: null,
  target: null,
})

/** The page under the pointer, or the nearest one (keyboard dragging). */
const underOrNearest: CollisionDetection = (args) => {
  const under = pointerWithin(args)
  return under.length ? under : closestCenter(args)
}

export function NoteTree({
  items,
  openId,
  onOpen,
  actions,
}: {
  items: Item[]
  openId: string | null
  onOpen: (id: string) => void
  actions: Actions
}) {
  const byId = new Map(items.map((i) => [i.id, i]))
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  )
  const drag = useDragState()
  const [target, setTarget] = useState<Target | null>(null)
  const dragged = drag.active ? byId.get(drag.active.id) : undefined
  // How deep the dragged page sits, so the lifted copy keeps its indent.
  let draggedDepth = 0
  for (let p = dragged?.parent ? byId.get(dragged.parent) : undefined; p; p = p.parent ? byId.get(p.parent) : undefined) {
    draggedDepth++
  }

  /** True if `id` is `ancestorId` or somewhere inside it (can't drop a page into itself). */
  const isWithin = (id: string, ancestorId: string) => {
    for (let it = byId.get(id); it; it = it.parent ? byId.get(it.parent) : undefined) {
      if (it.id === ancestorId) return true
    }
    return false
  }

  // Work out the zone from where the dragged row's middle is over the target row.
  const updateTarget = ({ active, over }: DragMoveEvent | DragOverEvent) => {
    const rect = active.rect.current.translated
    if (!over || !rect || isWithin(String(over.id), String(active.id))) {
      setTarget(null)
      return
    }
    const y = rect.top + rect.height / 2
    const part = (y - over.rect.top) / over.rect.height
    const zone: Zone = part < 0.25 ? 'before' : part > 0.75 ? 'after' : 'inside'
    setTarget((t) => (t?.id === over.id && t.zone === zone ? t : { id: String(over.id), zone }))
  }

  const onDragEnd = () => {
    const t = target
    const page = dragged
    drag.end()
    setTarget(null)
    if (!t || !page) return
    const onto = byId.get(t.id)
    if (!onto) return

    // Where it goes: a parent, and the sibling it goes before (null = last).
    const siblings = (parent: string | null) => childrenOf(items, parent, true).filter((p) => p.id !== page.id)
    let parent: string | null
    let before: string | null
    if (t.zone === 'inside') {
      parent = onto.id
      before = null
    } else {
      parent = onto.parent
      const list = siblings(parent)
      const at = list.findIndex((p) => p.id === onto.id)
      before = t.zone === 'before' ? onto.id : (list[at + 1]?.id ?? null)
    }

    // Nothing changed (dropped next to where it already was)?
    const current = childrenOf(items, page.parent, true)
    const currentBefore = current[current.findIndex((p) => p.id === page.id) + 1]?.id ?? null
    if (parent === page.parent && before === currentBefore) return

    void actions.move(
      page,
      { id: parent, title: parent ? (byId.get(parent)?.title ?? '') : 'Docs' },
      before,
      { parent: page.parent, before: currentBefore },
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={underOrNearest}
      onDragStart={drag.start}
      onDragMove={updateTarget}
      onDragOver={(event) => {
        drag.over(event)
        updateTarget(event)
      }}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        drag.end(false)
        setTarget(null)
      }}
    >
      <DropContext.Provider value={{ activeId: drag.active?.id ?? null, target }}>
        <Level items={items} parent={null} depth={0} openId={openId} onOpen={onOpen} />
      </DropContext.Provider>

      <DragOverlay dropAnimation={dropSettle}>
        {dragged && drag.active && (
          <Lifted grab={drag.active.grab} width={drag.active.width} className="rounded-control">
            <div
              className="flex h-[30px] items-center gap-2 rounded-control border border-border-menu bg-menu pr-2"
              // Row padding + the chevron's space + gap, same as the row.
              style={{ paddingLeft: 4 + draggedDepth * INDENT + 21 }}
            >
              <FileText size={15} strokeWidth={1.75} className="shrink-0 text-fg-2" aria-hidden="true" />
              <span className="truncate">{dragged.title}</span>
            </div>
          </Lifted>
        )}
      </DragOverlay>
    </DndContext>
  )
}

function Level({
  items,
  parent,
  depth,
  openId,
  onOpen,
}: {
  items: Item[]
  parent: string | null
  depth: number
  openId: string | null
  onOpen: (id: string) => void
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  return (
    <ul className="flex flex-col gap-0.5">
      {childrenOf(items, parent, true).map((note) => {
        const hasChildren = items.some((i) => i.parent === note.id)
        const open = !collapsed.has(note.id)
        return (
          <li key={note.id}>
            <Row
              note={note}
              depth={depth}
              active={note.id === openId}
              onOpen={onOpen}
              toggle={
                hasChildren ? (
                  <button
                    onClick={() =>
                      setCollapsed((c) => {
                        const next = new Set(c)
                        if (next.has(note.id)) next.delete(note.id)
                        else next.add(note.id)
                        return next
                      })
                    }
                    aria-label={open ? `Collapse ${note.title}` : `Expand ${note.title}`}
                    aria-expanded={open}
                    className="flex rounded p-0.5 text-fg-3"
                  >
                    <motion.span initial={false} animate={{ rotate: open ? 0 : -90 }} transition={spring.snappy} className="flex">
                      <ChevronDown size={13} strokeWidth={2} aria-hidden="true" />
                    </motion.span>
                  </button>
                ) : (
                  <span className="w-[17px]" />
                )
              }
            />
            {hasChildren && (
              <Collapse open={open}>
                <Level items={items} parent={note.id} depth={depth + 1} openId={openId} onOpen={onOpen} />
              </Collapse>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function Row({
  note,
  depth,
  active,
  onOpen,
  toggle,
}: {
  note: Item
  depth: number
  active: boolean
  onOpen: (id: string) => void
  toggle: ReactNode
}) {
  const { activeId, target } = useContext(DropContext)
  const draggable = useDraggable({ id: note.id, data: { type: 'note' } })
  const droppable = useDroppable({ id: note.id, data: { type: 'note' } })
  const zone = target?.id === note.id && activeId !== note.id ? target.zone : null
  const indent = 4 + depth * INDENT

  return (
    <div
      ref={(el) => {
        draggable.setNodeRef(el)
        droppable.setNodeRef(el)
      }}
      {...draggable.attributes}
      {...draggable.listeners}
      aria-label={`${note.title}, page. Press space to move.`}
      className={`relative flex h-[30px] items-center gap-1 rounded-control pr-2 transition-colors duration-100 ${
        draggable.isDragging
          ? 'bg-hover [&>*]:invisible'
          : zone === 'inside'
            ? 'bg-selected'
            : active
              ? 'bg-selected font-medium'
              : 'hover:bg-hover'
      }`}
      style={{ paddingLeft: indent }}
    >
      {toggle}
      <button onClick={() => onOpen(note.id)} className="flex h-full min-w-0 flex-1 items-center gap-2 text-left">
        <FileText size={15} strokeWidth={1.75} className="shrink-0 text-fg-2" aria-hidden="true" />
        <span className="truncate">{note.title}</span>
      </button>
      {/* Where it will land: a line above or below, at this page's indent. */}
      {(zone === 'before' || zone === 'after') && (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute right-1 h-0.5 rounded-full bg-accent ${
            zone === 'before' ? '-top-[2px]' : '-bottom-[2px]'
          }`}
          style={{ left: indent + 20 }}
        />
      )}
    </div>
  )
}
