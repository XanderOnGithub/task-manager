// Drag logic for two-level lists: groups that hold items.
//   List view:  milestones (groups) holding tasks (items)
//   Sidebar:    areas (groups) holding projects (items)
//
// While you drag, a temporary copy of the order ("draft") is rearranged so the
// UI responds instantly, including moving an item into another group. When you
// drop, one move is written to disk; the draft stays until the reload arrives,
// so nothing flickers back. If the move fails, the draft is dropped and things
// return to where they were.

import { useMemo, useState } from 'react'
import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { useDragState } from './drag'

/** Container id → ordered child ids. */
export type Order = Record<string, string[]>

interface Config {
  /** The real order, from the library. */
  base: Order
  /** Key in `base` for the top-level list (holds the groups, or loose items). */
  rootKey: string
  /** Parent id to write when something is dropped at the top level. */
  rootParent: string | null
  /** `data.type` of groups and of items. */
  groupType: string
  itemType: string
  /** Writes the move. `parent` is the new parent id; `before` the next sibling. */
  commit: (
    id: string,
    parent: string | null,
    before: string | null,
    from: { parent: string | null; before: string | null },
  ) => Promise<unknown>
}

export function useTwoLevelDrag({ base, rootKey, rootParent, groupType, itemType, commit }: Config) {
  const [draft, setDraft] = useState<Order | null>(null)
  const [from, setFrom] = useState<{ parent: string | null; before: string | null } | null>(null)
  const drag = useDragState()
  const order = draft ?? base

  return useMemo(() => {
    const containerOf = (id: string, o: Order) => Object.keys(o).find((k) => o[k].includes(id))
    const parentOf = (container: string) => (container === rootKey ? rootParent : container)

    const onDragStart = (event: DragStartEvent) => {
      const id = String(event.active.id)
      const container = containerOf(id, base) ?? rootKey
      const list = base[container]
      drag.start(event)
      setDraft(base)
      setFrom({ parent: parentOf(container), before: list[list.indexOf(id) + 1] ?? null })
    }

    // Items crossing into another group move in the draft right away, so the
    // group they're entering opens a gap for them.
    const onDragOver = ({ active, over }: DragOverEvent) => {
      if (!over || !draft || active.data.current?.type !== itemType) return
      const id = String(active.id)
      const overId = String(over.id)
      const source = containerOf(id, draft)
      const target = over.data.current?.type === groupType ? overId : containerOf(overId, draft)
      if (!source || !target || source === target || target === rootKey) return

      const targetList = draft[target] ?? []
      let index = targetList.indexOf(overId)
      if (index < 0) {
        index = 0 // over the group's header: go to the top of the group
      } else {
        const dragged = active.rect.current.translated
        if (dragged && dragged.top > over.rect.top + over.rect.height / 2) index += 1
      }
      setDraft({
        ...draft,
        [source]: draft[source].filter((x) => x !== id),
        [target]: [...targetList.slice(0, index), id, ...targetList.slice(index)],
      })
    }

    const onDragEnd = async ({ active, over }: DragEndEvent) => {
      drag.end()
      if (!draft || !from) return setDraft(null)
      const id = String(active.id)
      const container = active.data.current?.type === groupType ? rootKey : (containerOf(id, draft) ?? rootKey)
      let list = draft[container]
      const overId = over ? String(over.id) : null
      if (overId && overId !== id && list.includes(overId)) {
        list = arrayMove(list, list.indexOf(id), list.indexOf(overId))
      }
      const final = { ...draft, [container]: list }
      const parent = parentOf(container)
      const before = list[list.indexOf(id) + 1] ?? null

      if (parent === from.parent && before === from.before) return setDraft(null)
      setDraft(final) // hold the new order on screen while it saves
      await commit(id, parent, before, from)
      setDraft(null)
    }

    const onDragCancel = () => {
      drag.end()
      setDraft(null)
    }

    return { order, activeId: drag.active?.id ?? null, active: drag.active, onDragStart, onDragOver, onDragEnd, onDragCancel }
  }, [base, draft, from, drag, order, rootKey, rootParent, groupType, itemType, commit])
}
