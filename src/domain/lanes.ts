// Task lanes: the statuses a task can have, in board order. Todo, Doing and
// Done are always there; Later and Waiting are optional (Settings → General →
// Board lanes). Turning one off only hides it where nothing uses it: a task
// that's already Waiting keeps its lane until it moves.

import type { Item, TaskStatus } from '../platform/api'
import { usePref } from '../platform/prefs'

export interface Lane {
  status: TaskStatus
  label: string
  /** Class for the lane's colored dot. */
  dot: string
  /** What it's for, shown in Settings. */
  hint: string
}

export const LANES: Lane[] = [
  { status: 'later', label: 'Later', dot: 'bg-later', hint: 'Not up next. Keeps Todo short.' },
  { status: 'todo', label: 'Todo', dot: 'bg-todo', hint: '' },
  { status: 'doing', label: 'Doing', dot: 'bg-doing', hint: '' },
  { status: 'waiting', label: 'Waiting', dot: 'bg-waiting', hint: 'Held up by someone or something else.' },
  { status: 'done', label: 'Done', dot: 'bg-done', hint: '' },
]

/** The lanes you can turn on or off. */
export const OPTIONAL: TaskStatus[] = ['later', 'waiting']

/** Which optional lanes are on, as a setting. */
export function useOptionalLanes() {
  return usePref<TaskStatus[]>('lanes', [])
}

/**
 * The lanes to show, in order: the fixed ones, the optional ones that are
 * on, and any other lane one of `tasks` is in (so no task is ever hidden).
 */
export function useLanes(tasks: Item[] = []): Lane[] {
  const [on] = useOptionalLanes()
  return LANES.filter(
    (lane) => !OPTIONAL.includes(lane.status) || on.includes(lane.status) || tasks.some((t) => t.status === lane.status),
  )
}

/** Clicking a task's circle: Todo → Doing → Done → Todo. Later moves up to Todo; Waiting goes back to Doing. */
export const NEXT_STATUS: Record<TaskStatus, TaskStatus> = {
  later: 'todo',
  todo: 'doing',
  doing: 'done',
  waiting: 'doing',
  done: 'todo',
}
