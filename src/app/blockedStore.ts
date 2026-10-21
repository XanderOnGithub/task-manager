// Lets a task row ask "what is this waiting on?" without being handed the whole
// library. Rows are memoized (see CLAUDE.md), so they must not take `items` as
// a prop: it is a new array on every reload. Instead each row subscribes to its
// own answer, a plain string, and redraws only when that string changes.

import { useMemo, useSyncExternalStore } from 'react'
import type { Item } from '../platform/api'
import { openBlockers } from '../domain/blocked'

let current: readonly Item[] = []
const listeners = new Set<() => void>()

/** Called by App whenever the library's items change. */
export function setBlockedItems(items: readonly Item[]) {
  current = items
  listeners.forEach((l) => l())
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Titles can't contain "/" (core/src/names.rs), so it is a safe separator.
const SEPARATOR = '/'

/** Titles of the open tasks this one waits on, empty when it isn't blocked. */
export function useOpenBlockers(task: Item): string[] {
  const key = useSyncExternalStore(
    subscribe,
    () => (task.blockedBy.length === 0 ? '' : openBlockers(current, task).map((b) => b.title).join(SEPARATOR)),
    () => '',
  )
  return useMemo(() => (key ? key.split(SEPARATOR) : []), [key])
}
