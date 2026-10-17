// Keeps unchanged parts of the library the same objects across reloads.
//
// Every reload brings a whole new snapshot from Rust, with a fresh object for
// every item, even the ones that didn't change. React then redraws every row,
// because a new object looks like a change. Here each item that's the same as
// before is swapped back for its old object, so rows wrapped in `memo` skip
// redrawing, and `useMemo(…, [items])` keeps its result when nothing moved.
// If nothing changed at all, the old snapshot comes back as is and React does
// no work.

import type { Item, Snapshot } from './api'

/** The new snapshot, reusing everything from `prev` that didn't change. */
export function shareSnapshot(prev: Snapshot | null, next: Snapshot): Snapshot {
  if (!prev || prev.dataFolder !== next.dataFolder) return next

  const old = new Map(prev.items.map((item) => [item.id, item]))
  let itemsSame = prev.items.length === next.items.length
  const items = next.items.map((item, i) => {
    const before = old.get(item.id)
    const kept = before && sameItem(before, item) ? before : item
    if (kept !== prev.items[i]) itemsSame = false
    return kept
  })

  const issues = sameJson(prev.issues, next.issues) ? prev.issues : next.issues
  const unsorted = sameJson(prev.unsorted, next.unsorted) ? prev.unsorted : next.unsorted

  if (itemsSame && issues === prev.issues && unsorted === prev.unsorted) return prev
  return { ...next, items: itemsSame ? prev.items : items, issues, unsorted }
}

/** Items only hold plain values, so comparing each field is enough. */
function sameItem(a: Item, b: Item): boolean {
  for (const key in b) {
    if (a[key as keyof Item] !== b[key as keyof Item]) return false
  }
  return Object.keys(a).length === Object.keys(b).length
}

/** For the small lists (issues, Unsorted): compare their text. */
function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
