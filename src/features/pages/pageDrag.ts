// Dragging pages in the sidebar tree: the drop zones and the move they make.
// The rows are in components/PageTree.tsx; the sidebar's one DndContext is in
// components/AreaTree.tsx.

import { createContext, useState } from 'react'
import {
  closestCenter,
  pointerWithin,
  type CollisionDetection,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { type Item } from '../../platform/api'
import { childrenOf } from '../../domain/items'
import { useDragState } from '../../shared/drag/drag'
import type { Actions } from '../../app/useActions'

export type Zone = 'before' | 'inside' | 'after'
export interface PageTarget {
  id: string
  zone: Zone
}

/** Indent per level, in px. */
export const INDENT = 16
/** Width of the fold chevron slot plus the gap after it. The icon sits this far in from the row's padding. */
export const TOGGLE = 21

/** Shared with every row: what's being dragged and where it would land. */
export const PageDropContext = createContext<{ activeId: string | null; target: PageTarget | null }>({
  activeId: null,
  target: null,
})

/**
 * While a page is dragged: the page, area or project row under the pointer,
 * or the nearest page (keyboard dragging).
 */
export const pageCollision: CollisionDetection = (args) => {
  const targets = args.droppableContainers.filter((c) =>
    ['page', 'area', 'project'].includes(String(c.data.current?.type)),
  )
  const under = pointerWithin({ ...args, droppableContainers: targets })
  if (under.length) return under
  return closestCenter({ ...args, droppableContainers: targets.filter((c) => c.data.current?.type === 'page') })
}

/**
 * Everything the sidebar needs to drag pages. `reveal` is called with the new
 * parent after a drop, so a folded project or page can open to show it.
 */
export function usePageDrag(items: Item[], actions: Actions, reveal: (parentId: string) => void) {
  const byId = new Map(items.map((i) => [i.id, i]))
  const drag = useDragState()
  const [target, setTarget] = useState<PageTarget | null>(null)
  const dragged = drag.active ? byId.get(drag.active.id) : undefined

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
    let zone: Zone = 'inside'
    // Only pages have above/below. Areas and projects take pages inside.
    if (over.data.current?.type === 'page') {
      const part = (rect.top + rect.height / 2 - over.rect.top) / over.rect.height
      zone = part < 0.25 ? 'before' : part > 0.75 ? 'after' : 'inside'
    }
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
    if (!parent) return

    reveal(parent)
    void actions.move(page, { id: parent, title: byId.get(parent)?.title ?? '' }, before, {
      parent: page.parent,
      before: currentBefore,
    })
  }

  return {
    dragged,
    active: drag.active,
    target,
    onDragStart: (event: DragStartEvent) => drag.start(event),
    onDragMove: updateTarget,
    onDragOver: (event: DragOverEvent) => {
      drag.over(event)
      updateTarget(event)
    },
    onDragEnd,
    onDragCancel: () => {
      drag.end(false)
      setTarget(null)
    },
  }
}

