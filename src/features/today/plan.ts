// What is due, grouped for the Today view.
//
//   Overdue      before today
//   Today
//   Tomorrow, Fri Oct 23, ...   each of the next six days that has something due
//
// Only tasks that aren't done. A repeating task that was finished is back to Todo
// with its next date, so it shows up again when that day comes.

import { tasksUnder, type PlacedTask } from '../../domain/items'
import { toIso, weekdayLabel } from '../../domain/dates'
import type { Item } from '../../platform/api'

export interface PlanGroup {
  /** "Overdue", "Today", "Tomorrow", "Fri, Oct 23". */
  label: string
  /** YYYY-MM-DD, or "overdue". */
  key: string
  tasks: PlacedTask[]
}

/** How many days after today are shown. */
export const DAYS_AHEAD = 6

/** The groups that have something in them, in order. `today` is a parameter so tests can pick the day. */
export function planFor(items: readonly Item[], today: Date = new Date()): PlanGroup[] {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const todayIso = toIso(start)
  const lastIso = toIso(new Date(start.getFullYear(), start.getMonth(), start.getDate() + DAYS_AHEAD))

  const open = tasksUnder(items, null).filter(({ task }) => task.due && task.status !== 'done')
  const byDay = new Map<string, PlacedTask[]>()
  const overdue: PlacedTask[] = []
  for (const placed of open) {
    const due = placed.task.due as string
    if (due < todayIso) overdue.push(placed)
    else if (due <= lastIso) byDay.set(due, [...(byDay.get(due) ?? []), placed])
  }

  // Oldest first, so the thing that has been waiting longest is on top.
  overdue.sort((a, b) => (a.task.due as string).localeCompare(b.task.due as string))
  const groups: PlanGroup[] = []
  if (overdue.length) groups.push({ label: 'Overdue', key: 'overdue', tasks: overdue })
  for (let offset = 0; offset <= DAYS_AHEAD; offset++) {
    const day = toIso(new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset))
    const tasks = byDay.get(day)
    if (!tasks) continue
    const label = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : weekdayLabel(day)
    groups.push({ label, key: day, tasks })
  }
  return groups
}

/** How many tasks need attention now: overdue and due today. For the sidebar. */
export function dueNowCount(items: readonly Item[], today: Date = new Date()): number {
  const todayIso = toIso(new Date(today.getFullYear(), today.getMonth(), today.getDate()))
  return tasksUnder(items, null).filter(({ task }) => task.due && task.due <= todayIso && task.status !== 'done').length
}
