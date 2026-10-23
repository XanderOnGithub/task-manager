// Milestones as a list of rows: each one with its project and how far along it
// is. Used by the Milestones view (features/tasks/MilestoneTable.tsx).

import type { Item } from '../platform/api'
import { childrenOf } from './items'

export interface MilestoneRow {
  milestone: Item
  project: Item
  done: number
  total: number
}

/** Every milestone inside `scope` (an area or project; null = everywhere), in list order. */
export function milestoneRows(items: readonly Item[], scope: Item | null): MilestoneRow[] {
  const projects =
    scope?.kind === 'project'
      ? [scope]
      : (scope ? [scope] : childrenOf(items, null)).flatMap((area) => childrenOf(items, area.id).filter((p) => p.kind === 'project'))
  const rows: MilestoneRow[] = []
  for (const project of projects) {
    for (const milestone of childrenOf(items, project.id)) {
      if (milestone.kind !== 'milestone') continue
      const tasks = childrenOf(items, milestone.id)
      rows.push({ milestone, project, done: tasks.filter((t) => t.status === 'done').length, total: tasks.length })
    }
  }
  return rows
}
