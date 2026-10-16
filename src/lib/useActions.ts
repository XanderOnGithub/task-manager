// Every change the UI can make, in one place.
//
// Each action calls the Rust side, shows a toast (with Undo where it makes
// sense), and reloads the library. Errors from Rust are already written for
// people ("A project goes inside an area"), so they're shown as-is.

import { useMemo } from 'react'
import * as api from './api'
import type { Item, Kind, UnsortedEntry } from './api'
import { useToast } from './toast'

export type Actions = ReturnType<typeof useActions>

export function useActions(reload: () => Promise<void>) {
  const toast = useToast()

  return useMemo(() => {
    /** Runs `work`, reloads, and turns failures into an error toast. Returns undefined on failure. */
    async function run<T>(work: () => Promise<T>): Promise<T | undefined> {
      try {
        const result = await work()
        await reload()
        return result
      } catch (e) {
        toast({ message: String(e), tone: 'error' })
        await reload()
        return undefined
      }
    }

    return {
      // Unsorted -------------------------------------------------------------
      capture: (text: string) =>
        run(async () => {
          await api.addUnsorted(text)
          toast({ message: 'Added to Unsorted' })
        }),

      /** Files an Unsorted entry into `destination` (null = top level, for notes). */
      fileEntry: (entry: UnsortedEntry, kind: Kind, destination: { id: string | null; title: string }) =>
        run(async () => {
          const id = await api.fileUnsorted(entry, kind, destination.id)
          toast({
            message: `Moved to ${destination.title}`,
            undo: () =>
              run(async () => {
                await api.trashItem(id)
                await api.restoreUnsorted(entry)
              }),
          })
          return id
        }),

      removeEntry: (entry: UnsortedEntry) =>
        run(async () => {
          await api.removeUnsorted(entry)
          toast({ message: 'Deleted from Unsorted', undo: () => run(() => api.restoreUnsorted(entry)) })
        }),

      // Items ----------------------------------------------------------------
      create: (kind: Kind, parent: string | null, title: string) => run(() => api.createItem(kind, parent, title)),

      rename: (item: Item, title: string) => run(() => api.renameItem(item.id, title)),

      /**
       * Moves `item` into `to` (an item id, or null for the top level), placed
       * before `before` (or at the end). Moving to a different parent shows a
       * toast whose Undo puts it back exactly where it was (`from`).
       */
      move: (
        item: Item,
        to: { id: string | null; title: string },
        before: string | null,
        from: { parent: string | null; before: string | null },
      ) =>
        run(async () => {
          await api.moveItem(item.id, to.id, before)
          if (to.id !== from.parent) {
            toast({
              message: `Moved to ${to.title}`,
              undo: () => run(() => api.moveItem(item.id, from.parent, from.before)),
            })
          }
        }),

      setStatus: (item: Item, status: string) => run(() => api.setField(item.id, 'status', status)),

      setDue: (item: Item, due: string | null) => run(() => api.setField(item.id, 'due', due)),

      setColor: (item: Item, color: string) => run(() => api.setField(item.id, 'color', color)),

      writeBody: (item: Item, body: string) => run(() => api.writeBody(item.id, body)),

      trash: (item: Item) =>
        run(async () => {
          const trashed = await api.trashItem(item.id)
          toast({ message: `Deleted ${item.title}`, undo: () => run(() => api.restoreItem(trashed)) })
        }),

      reveal: (item: Item) => run(() => api.revealInFinder(item.id)),

      copyPath: (item: Item) =>
        run(async () => {
          await navigator.clipboard.writeText(await api.itemPath(item.id))
          toast({ message: 'Copied path' })
        }),
    }
  }, [reload, toast])
}
