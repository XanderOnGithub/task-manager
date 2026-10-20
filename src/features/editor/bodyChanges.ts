// Knowing when an item's text changed outside the app.
//
// Bodies aren't part of the library snapshot (reading every file would make
// loading slow), and an item whose details didn't change stays the very same
// object between reloads. So an edit made somewhere else (another app, a Git
// sync) to just the text would go unnoticed by a page that is open.
//
// The Rust side reports which files changed (`data-changed`). This keeps a
// counter per file, and `useBodyRevision` lets an open item re-read its text
// when its own file's counter moves.

import { useSyncExternalStore } from 'react'
import type { Item } from '../../platform/api'

const revisions = new Map<string, number>()
const listeners = new Set<() => void>()

/** Call with the paths a `data-changed` event carried. */
export function notifyBodyChanges(paths: string[]) {
  for (const path of paths) revisions.set(path, (revisions.get(path) ?? 0) + 1)
  if (paths.length > 0) listeners.forEach((listener) => listener())
}

/** The file that holds an item's frontmatter and text. */
export function metaPath(item: Pick<Item, 'path' | 'isFolder'>): string {
  return item.isFolder ? `${item.path}/_index.md` : item.path
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** A number that goes up each time `path` changed outside the app. */
export function useBodyRevision(path: string): number {
  return useSyncExternalStore(subscribe, () => revisions.get(path) ?? 0)
}
