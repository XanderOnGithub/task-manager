// What you can still undo.
//
// A toast with an Undo button stays up for a few seconds. Everything that had
// one is also kept here for the rest of the session (the newest 50), so ⌘Z keeps
// working after the toast is gone, and "Recent changes" can undo something
// from a few minutes ago. Closing Moss clears it; deleted items stay in the
// Trash for 30 days either way.
//
// Undoing something can itself show a toast with an Undo (restoring a deleted
// item, say). Those entries are kept too, and listed, but ⌘Z skips them, so
// pressing ⌘Z again goes further back instead of undoing the undo.

import { useSyncExternalStore } from 'react'

export interface HistoryEntry {
  id: number
  /** What the toast said: "Deleted Pick tile", "Moved to Bathroom". */
  message: string
  /** Milliseconds since 1970. */
  at: number
  /** Already undone. */
  undone: boolean
  /** Made while something was being undone (see above). */
  fromUndo: boolean
  run: () => Promise<unknown> | void
}

const MAX_ENTRIES = 50

let entries: readonly HistoryEntry[] = []
let nextId = 1
let undoing = 0
const listeners = new Set<() => void>()

function set(next: readonly HistoryEntry[]) {
  entries = next
  listeners.forEach((listener) => listener())
}

/** Remembers an undoable change. Returns its id. */
export function recordUndo(message: string, run: HistoryEntry['run']): number {
  const entry: HistoryEntry = { id: nextId++, message, at: Date.now(), undone: false, fromUndo: undoing > 0, run }
  set([entry, ...entries].slice(0, MAX_ENTRIES))
  return entry.id
}

/** Undoes one entry. False if it is gone or was already undone. */
export async function undoEntry(id: number): Promise<boolean> {
  const entry = entries.find((e) => e.id === id)
  if (!entry || entry.undone) return false
  set(entries.map((e) => (e.id === id ? { ...e, undone: true } : e)))
  undoing++
  try {
    await entry.run()
  } finally {
    undoing--
  }
  return true
}

/** The newest change ⌘Z would undo. */
export function latestUndoable(): HistoryEntry | undefined {
  return entries.find((e) => !e.undone && !e.fromUndo)
}

/** For tests. */
export function clearHistory() {
  set([])
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The entries, newest first. */
export function useHistory(): readonly HistoryEntry[] {
  return useSyncExternalStore(subscribe, () => entries)
}
