// Tasks that wait on other tasks (`blockedBy` on a task, see core/src/blockers.rs).
// A reminder, not a lock: nothing stops you from finishing a blocked task.

import type { Item } from '../platform/api'
import { itemById, tasksUnder, trailOf } from './items'
import { vocab } from './vocab'

/** The tasks this one still waits on: its blockers that exist and aren't done. */
export function openBlockers(items: readonly Item[], task: Item): Item[] {
  const out: Item[] = []
  for (const id of task.blockedBy) {
    const blocker = itemById(items, id)
    if (blocker && blocker.kind === 'task' && blocker.status !== 'done') out.push(blocker)
  }
  return out
}

/** Every task this one waits on, done or not, for the details panel. Ids of deleted tasks are left out. */
export function blockersOf(items: readonly Item[], task: Item): Item[] {
  return task.blockedBy.map((id) => itemById(items, id)).filter((b): b is Item => !!b && b.kind === 'task')
}

/** Tasks this one could wait on: the others in its project, not finished and not already chosen. */
export function blockerChoices(items: readonly Item[], task: Item): Item[] {
  const project = trailOf(items, task.id).find((i) => i.kind === 'project')
  if (!project) return []
  return tasksUnder(items, project.id)
    .map((placed) => placed.task)
    .filter((t) => t.id !== task.id && t.status !== 'done' && !task.blockedBy.includes(t.id))
}

/** The wording on a row: "Waiting on Pick tile" or "Waiting on 3 tasks" (Formal mode: "Blocked by …"). */
export function waitingText(titles: readonly string[]): string {
  const words = vocab()
  return titles.length === 1 ? `${words.waitingOn} ${titles[0]}` : `${words.waitingOn} ${words.count(titles.length, 'task')}`
}
