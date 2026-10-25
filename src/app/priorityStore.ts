// Task priorities, kept by the app rather than in the task files.
//
// Priority is a front-end feature: it lives in this computer's preferences
// (platform/prefs.ts), keyed by task id. Ids never change, so a priority
// survives renames, moves, repeats and a trip through the Trash. It does not
// travel with Git sync or to another computer.
//
// Rows are memoized (see CLAUDE.md), so each row subscribes to its own task's
// priority and redraws only when that one number changes.

import { useSyncExternalStore } from 'react'
import { onPrefChange, readPref, setPref } from '../platform/prefs'

/** 1 = Urgent, 2 = High, 3 = Medium, 4 = Low. No priority is `null`. */
export type Priority = 1 | 2 | 3 | 4

export const PRIORITIES: readonly Priority[] = [1, 2, 3, 4]

const PREF = 'priorities'

type Table = Record<string, Priority>

let table: Table = readTable()

function readTable(): Table {
  const raw = readPref<unknown>(PREF, {})
  if (!raw || typeof raw !== 'object') return {}
  const out: Table = {}
  for (const [id, value] of Object.entries(raw)) {
    if (value === 1 || value === 2 || value === 3 || value === 4) out[id] = value
  }
  return out
}

const subscribe = (listener: () => void) =>
  onPrefChange(PREF, () => {
    table = readTable()
    listener()
  })

/** A task's priority, or null. */
export function priorityOf(id: string): Priority | null {
  return table[id] ?? null
}

/** Sets a task's priority; null clears it. */
export function setPriority(id: string, priority: Priority | null) {
  const next = { ...table }
  if (priority === null) delete next[id]
  else next[id] = priority
  table = next
  setPref(PREF, next)
}

/** A task's priority as React state: redraws only when this task's priority changes. */
export function usePriority(id: string): Priority | null {
  return useSyncExternalStore(
    subscribe,
    () => priorityOf(id),
    () => null,
  )
}

/** Sorts by priority, Urgent first and no priority last; equal ones keep their order. */
export function byPriority<T>(list: readonly T[], idOf: (entry: T) => string): T[] {
  const rank = (entry: T) => priorityOf(idOf(entry)) ?? 5
  return list
    .map((entry, i) => ({ entry, i }))
    .sort((a, b) => rank(a.entry) - rank(b.entry) || a.i - b.i)
    .map(({ entry }) => entry)
}

/** Redraws the caller whenever any priority changes; for views that sort by priority. */
export function usePriorities(): Readonly<Table> {
  return useSyncExternalStore(
    subscribe,
    () => table,
    () => table,
  )
}
