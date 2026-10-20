// Small helpers for working with items, shared by several components.

import { childrenOf, type Item, type Status } from '../platform/api'

/** Default props for Lucide icons: 16px, 1.75 stroke. */
export const icon = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const

/** Capitalizes a status for display ("doing" → "Doing"). */
export function statusLabel(status: Status | null): string {
  return status ? status[0].toUpperCase() + status.slice(1) : ''
}

/** A task with the milestone and project it sits in (if any). */
export interface PlacedTask {
  task: Item
  milestone: Item | null
  project: Item | null
}

/**
 * Every task inside an area, project or milestone, in list order (project by
 * project, milestone by milestone), with where each one sits. `null` = every
 * task in every area.
 */
export function tasksUnder(items: Item[], scopeId: string | null): PlacedTask[] {
  const out: PlacedTask[] = []
  const children = (id: string) => childrenOf(items, id)
  const walk = (id: string, milestone: Item | null, project: Item | null) => {
    for (const child of children(id)) {
      if (child.kind === 'task') out.push({ task: child, milestone, project })
      else if (child.kind === 'milestone') walk(child.id, child, project)
      else if (child.kind === 'project') walk(child.id, null, child)
    }
  }
  if (scopeId === null) {
    for (const area of childrenOf(items, null)) walk(area.id, null, null)
    return out
  }
  const scope = items.find((i) => i.id === scopeId)
  walk(
    scopeId,
    scope?.kind === 'milestone' ? scope : null,
    scope?.kind === 'project' ? scope : scope?.kind === 'milestone' ? (items.find((i) => i.id === scope.parent) ?? null) : null,
  )
  return out
}

/** Done and total tasks anywhere inside an area, project or milestone (`null` = everywhere). */
export function taskCounts(items: Item[], scopeId: string | null): { done: number; total: number } {
  const tasks = tasksUnder(items, scopeId)
  return { done: tasks.filter(({ task }) => task.status === 'done').length, total: tasks.length }
}

/** The item and its parents, top first (area → project → milestone). */
export function trailOf(items: Item[], id: string): Item[] {
  const byId = new Map(items.map((i) => [i.id, i]))
  const trail: Item[] = []
  for (let it = byId.get(id); it; it = it.parent ? byId.get(it.parent) : undefined) trail.unshift(it)
  return trail
}
