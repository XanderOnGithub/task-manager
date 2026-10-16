// Small helpers for working with items, shared by several components.

import type { Item, Status } from './api'

/** Default props for Lucide icons: 16px, 1.75 stroke. */
export const icon = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const

/** Capitalizes a status for display ("doing" → "Doing"). */
export function statusLabel(status: Status | null): string {
  return status ? status[0].toUpperCase() + status.slice(1) : ''
}

/** Done and total tasks anywhere inside a project. */
export function taskCounts(items: Item[], projectId: string): { done: number; total: number } {
  const inside = new Set([projectId, ...items.filter((i) => i.parent === projectId).map((i) => i.id)])
  const tasks = items.filter((i) => i.kind === 'task' && i.parent !== null && inside.has(i.parent))
  return { done: tasks.filter((t) => t.status === 'done').length, total: tasks.length }
}
