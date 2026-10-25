// Small helpers for working with items, shared by several components.

import type { Item, MilestoneColor, Status } from '../platform/api'
import { vocab } from './vocab'

/** Default props for Lucide icons: 16px, 1.75 stroke. */
export const icon = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const

/** A status as shown ("doing" → "Doing", or "In progress" in Formal mode, see vocab.ts). */
export function statusLabel(status: Status | null): string {
  return vocab().status(status)
}

// ---------------------------------------------------------------------------
// The index: who is inside whom, worked out once per library
// ---------------------------------------------------------------------------
//
// Screens ask "what is in this project?" all the time (every row, every
// render). Answering by filtering the whole list each time costs a pass over
// every item per question. Instead the answers are worked out once for a given
// `items` array and remembered. The library hands out the same array until
// something in it changes (see app/share.ts), so the index is rebuilt only
// then. The arrays it returns are shared: don't change them.

interface Index {
  byId: Map<string, Item>
  /** Children by parent and kind of child, already in display order. */
  children: Map<string, readonly Item[]>
  /** Tasks under each scope (null = everywhere), worked out on first ask. */
  tasks: Map<string | null, PlacedTask[]>
}

const indexes = new WeakMap<readonly Item[], Index>()
const NONE: readonly Item[] = Object.freeze([])

const childKey = (parent: string | null, pages: boolean) => `${parent ?? ''}|${pages ? 'p' : 'i'}`

function indexOf(items: readonly Item[]): Index {
  let index = indexes.get(items)
  if (index) return index
  const byId = new Map<string, Item>()
  const groups = new Map<string, Item[]>()
  for (const item of items) {
    byId.set(item.id, item)
    const key = childKey(item.parent, item.kind === 'page')
    const group = groups.get(key)
    if (group) group.push(item)
    else groups.set(key, [item])
  }
  for (const group of groups.values()) group.sort(compareForDisplay)
  index = { byId, children: groups, tasks: new Map() }
  indexes.set(items, index)
  return index
}

/**
 * Children of `parent` in display order. An area or project holds two lists,
 * its projects/milestones/tasks and its pages; `pages` picks which.
 */
export function childrenOf(items: readonly Item[], parent: string | null, pages = false): readonly Item[] {
  return indexOf(items).children.get(childKey(parent, pages)) ?? NONE
}

/** The item with this id, or undefined. */
export function itemById(items: readonly Item[], id: string): Item | undefined {
  return indexOf(items).byId.get(id)
}

/** Same order as the Rust side: order key first, then title. */
export function compareForDisplay(a: Item, b: Item): number {
  if (a.order && b.order) return a.order < b.order ? -1 : a.order > b.order ? 1 : a.title.localeCompare(b.title)
  if (a.order) return -1
  if (b.order) return 1
  return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
}

/** The milestone palette, in picker order. Names match `--color-ms-*` in tokens.css. */
export const MILESTONE_COLORS: MilestoneColor[] = ['dusty-blue', 'mauve', 'rose', 'teal', 'lavender', 'sand']

/** A task with the milestone and project it sits in (if any). */
export interface PlacedTask {
  task: Item
  milestone: Item | null
  project: Item | null
}

/**
 * Every task inside an area, project or milestone, in list order (project by
 * project, milestone by milestone), with where each one sits. `null` = every
 * task in every area. The result is shared: don't change it.
 */
export function tasksUnder(items: readonly Item[], scopeId: string | null): readonly PlacedTask[] {
  const index = indexOf(items)
  const known = index.tasks.get(scopeId)
  if (known) return known

  const out: PlacedTask[] = []
  const walk = (id: string, milestone: Item | null, project: Item | null) => {
    for (const child of childrenOf(items, id)) {
      if (child.kind === 'task') out.push({ task: child, milestone, project })
      else if (child.kind === 'milestone') walk(child.id, child, project)
      else if (child.kind === 'project') walk(child.id, null, child)
    }
  }
  if (scopeId === null) {
    for (const area of childrenOf(items, null)) walk(area.id, null, null)
  } else {
    const scope = index.byId.get(scopeId)
    walk(
      scopeId,
      scope?.kind === 'milestone' ? scope : null,
      scope?.kind === 'project' ? scope : scope?.kind === 'milestone' ? (index.byId.get(scope.parent ?? '') ?? null) : null,
    )
  }
  index.tasks.set(scopeId, out)
  return out
}

/** Done and total tasks anywhere inside an area, project or milestone (`null` = everywhere). */
export function taskCounts(items: readonly Item[], scopeId: string | null): { done: number; total: number } {
  const tasks = tasksUnder(items, scopeId)
  return { done: tasks.filter(({ task }) => task.status === 'done').length, total: tasks.length }
}

/** The item and its parents, top first (area → project → milestone). */
export function trailOf(items: readonly Item[], id: string): Item[] {
  const { byId } = indexOf(items)
  const trail: Item[] = []
  for (let it = byId.get(id); it; it = it.parent ? byId.get(it.parent) : undefined) trail.unshift(it)
  return trail
}
