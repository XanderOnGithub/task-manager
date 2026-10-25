// Every change the UI can make, in one place.
//
// Each action calls the Rust side, shows a toast (with Undo where it makes
// sense), and reloads the library. Errors from Rust are already written for
// people ("A project goes inside an area"), so they're shown as-is.

import { playStatusSound, statusBurst } from '../shared/impact/impact'
import { useMemo, useRef } from 'react'
import * as api from '../platform/api'
import type { Item, Kind, UnsortedEntry } from '../platform/api'
import { useToast } from '../shared/toast/toast'
import { play } from '../sound/sounds'
import { confirm } from '../shared/confirm/confirm'
import { weekdayLabel } from '../domain/dates'
import { parseDue } from '../domain/naturalDate'
import { childrenOf } from '../domain/items'
import { vocab } from '../domain/vocab'
import { setPriority, type Priority } from './priorityStore'

export type Actions = ReturnType<typeof useActions>

/**
 * `items` is the current library; deleting uses it to say what's inside the
 * thing being deleted.
 */
export function useActions(reload: () => Promise<void>, items: Item[] = []) {
  const toast = useToast()
  const latestItems = useRef(items)
  latestItems.current = items

  return useMemo(() => {
    /**
     * Runs `work`, reloads, and turns failures into an error toast.
     *
     * Returns `undefined` when it failed, and never when it worked: work that
     * has nothing to give back counts as `true`. So `!== undefined` always means
     * "it worked", which is what lets a field keep what you typed after a failure.
     */
    async function run<T>(work: () => Promise<T>): Promise<(T extends void ? true : NonNullable<T>) | undefined> {
      type Done = T extends void ? true : NonNullable<T>
      try {
        const result = await work()
        await reload()
        return (result ?? true) as Done
      } catch (e) {
        toast({ message: String(e), tone: 'error' })
        await reload()
        return undefined
      }
    }

    return {
      // Unsorted -------------------------------------------------------------
      /** True when it was added; false when it failed (the text stays where it was typed). */
      capture: async (text: string) =>
        (await run(async () => {
          play('capture')
          await api.addUnsorted(text)
          toast({ message: `Added to ${vocab().unsorted}` })
        })) !== undefined,

      /** Files an Unsorted entry into `destination` (null = top level, for notes). */
      fileEntry: (entry: UnsortedEntry, kind: Kind, destination: { id: string | null; title: string }) =>
        run(async () => {
          // "call Bob friday" becomes a task called "call Bob", due on Friday.
          const parsed = kind === 'task' ? parseDue(entry.text) : { text: entry.text, due: null }
          const id = await api.fileUnsorted(
            entry,
            kind,
            destination.id,
            parsed.due ? { text: parsed.text, due: parsed.due } : {},
          )
          play('drop')
          toast({
            message: `Moved to ${destination.title}${parsed.due ? ` · Due ${weekdayLabel(parsed.due)}` : ''}`,
            undo: () =>
              run(async () => {
                await api.trashItem(id)
                await api.restoreUnsorted(entry)
              }),
          })
          return id
        }),

      /**
       * Files several Unsorted entries into one destination, in the order they
       * are on the list. One toast, one Undo for all of them. If one fails, the
       * ones before it stay filed (and can still be undone) and the error is shown.
       */
      fileEntries: (entries: UnsortedEntry[], kind: Kind, destination: { id: string | null; title: string }) =>
        run(async () => {
          const filed: { id: string; entry: UnsortedEntry }[] = []
          let failure: unknown = null
          for (const entry of entries) {
            try {
              const parsed = kind === 'task' ? parseDue(entry.text) : { text: entry.text, due: null }
              const id = await api.fileUnsorted(entry, kind, destination.id, parsed.due ? { text: parsed.text, due: parsed.due } : {})
              filed.push({ id, entry })
            } catch (e) {
              failure = e
              break
            }
          }
          if (filed.length > 0) {
            play('drop')
            toast({
              message: `Moved ${filed.length} ${filed.length === 1 ? 'item' : 'items'} to ${destination.title}`,
              undo: () =>
                run(async () => {
                  // Back to the lines they came from, top line first so each lands where it was.
                  for (const { id } of filed) await api.trashItem(id)
                  for (const { entry } of [...filed].sort((a, b) => a.entry.line - b.entry.line)) await api.restoreUnsorted(entry)
                }),
            })
          }
          if (failure) throw failure
          return filed.map((f) => f.id)
        }),

      /** Deletes several Unsorted entries: one toast, one Undo for all of them. */
      removeEntries: (entries: UnsortedEntry[]) =>
        run(async () => {
          play('delete')
          const removed: UnsortedEntry[] = []
          try {
            for (const entry of entries) {
              await api.removeUnsorted(entry)
              removed.push(entry)
            }
          } finally {
            // Whatever did go can still be put back, even if a later one failed.
            if (removed.length > 0) {
              toast({
                message: removed.length === 1 ? `Deleted from ${vocab().unsorted}` : `Deleted ${removed.length} items from ${vocab().unsorted}`,
                // Top line first, so each lands on the line it came from.
                undo: () =>
                  run(async () => {
                    for (const entry of [...removed].sort((a, b) => a.line - b.line)) await api.restoreUnsorted(entry)
                  }),
              })
            }
          }
        }),

      removeEntry: (entry: UnsortedEntry) =>
        run(async () => {
          play('delete')
          await api.removeUnsorted(entry)
          toast({ message: `Deleted from ${vocab().unsorted}`, undo: () => run(() => api.restoreUnsorted(entry)) })
        }),

      // Items ----------------------------------------------------------------
      /** A task's title may end in a date ("call Bob friday"): that becomes its due date. */
      create: (kind: Kind, parent: string | null, title: string) => {
        const parsed = kind === 'task' ? parseDue(title) : { text: title, due: null }
        return run(() => api.createItem(kind, parent, parsed.text, parsed.due))
      },

      /** True when renamed; false when it failed (a name already taken, say). */
      /**
       * Adds a milestone to `project`. A project holds milestones or loose tasks,
       * never both, so if it has loose tasks they move into the new milestone.
       * Returns the milestone's id (undefined when it failed).
       */
      addMilestone: (project: Item, title: string) => {
        const loose = childrenOf(latestItems.current, project.id).filter((c) => c.kind === 'task').length
        return run(async () => {
          const id = await api.groupIntoMilestone(project.id, title)
          if (loose > 0) toast({ message: `Moved ${vocab().count(loose, 'task')} into ${title}` })
          return id
        })
      },

      rename: async (item: Item, title: string) => (await run(() => api.renameItem(item.id, title))) !== undefined,

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

      setStatus: (item: Item, status: string) => {
        if (status !== item.status) {
          playStatusSound(status)
          statusBurst(item.id, status)
        }
        return run(async () => {
          // Finishing a repeating task puts it back to Todo with its next date.
          const next = await api.setStatus(item.id, status)
          if (next) {
            toast({
              message: `Done. Next due ${weekdayLabel(next)}`,
              undo: () =>
                run(async () => {
                  await api.setField(item.id, 'status', item.status)
                  await api.setField(item.id, 'due', item.due)
                }),
            })
          }
        })
      },

      /** How often a task comes back: "daily", "weekly", "every 2 weeks"; null stops it repeating. */
      setRepeat: (item: Item, repeat: string | null) => run(() => api.setField(item.id, 'repeat', repeat)),

      /** Tasks this one waits on (ids). The data layer refuses circles and non-tasks. */
      setBlockers: (item: Item, ids: string[]) => run(() => api.setField(item.id, 'blocked_by', ids.length ? ids.join(', ') : null)),

      /**
       * A task's priority (1 Urgent … 4 Low), null for none. Kept by the app,
       * not in the file (app/priorityStore.ts), so there is nothing to reload.
       */
      setPriority: (item: Item, priority: Priority | null) => {
        if (priority === null) setPriority(item.id, null)
        else {
          play('select', { pitch: 1.15 - priority * 0.05 })
          setPriority(item.id, priority)
        }
      },

      setDue: (item: Item, due: string | null) => run(() => api.setField(item.id, 'due', due)),

      setColor: (item: Item, color: string) => run(() => api.setField(item.id, 'color', color)),

      /** A page's emoji icon; null removes it. */
      setIcon: (item: Item, icon: string | null) => {
        play('select', { pitch: icon ? 1.1 : 0.9 })
        return run(() => api.setField(item.id, 'icon', icon))
      },

      /**
       * Saves an item's text. No reload afterwards: text isn't part of the
       * library, so nothing on screen changes and the whole library needn't
       * travel over again for every pause in typing. No error toast either:
       * it rejects, and the editor keeps the text, retries and tells you once
       * (see lib/saveQueue.ts).
       */
      writeBody: (item: Item, body: string) => api.writeBody(item.id, body),

      trash: async (item: Item) => {
        // Something with items inside asks first; a single task or empty
        // page goes straight away (Undo and the Trash cover those).
        const inside = describeInside(latestItems.current, item.id)
        if (inside) {
          const yes = await confirm({
            title: `Delete ${item.title}?`,
            body: `${inside} go to the trash too. You can restore them from the Trash for 30 days.`,
            action: 'Delete',
            danger: true,
          })
          if (!yes) return
        }
        return run(async () => {
          play('delete')
          const trashed = await api.trashItem(item.id)
          toast({ message: `Deleted ${item.title}`, undo: () => run(() => api.restoreItem(trashed)) })
        })
      },

      /** Trash view: put something back where it was. */
      restoreFromTrash: (entry: api.TrashEntry) =>
        run(async () => {
          if (!entry.original) throw new Error("Moss doesn't know where this came from. Use Reveal in Finder to move it back.")
          play('undo')
          await api.restoreItem({ trashPath: entry.path, originalPath: entry.original })
          toast({ message: `Restored ${entry.title}` })
        }),

      /** Trash view: delete one thing for good. */
      deleteForever: async (entry: api.TrashEntry) => {
        const yes = await confirm({
          title: `Delete ${entry.title} for good?`,
          body: "It can't be restored after this.",
          action: 'Delete for good',
          danger: true,
        })
        if (!yes) return
        return run(async () => {
          play('delete')
          await api.deleteForever(entry.path)
          toast({ message: `Deleted ${entry.title} for good` })
        })
      },

      /** Trash view: delete everything in it for good. */
      emptyTrash: async (count: number) => {
        const yes = await confirm({
          title: 'Empty the trash?',
          body: `${count === 1 ? '1 thing' : `${count} things`} will be deleted for good. They can't be restored after this.`,
          action: 'Empty trash',
          danger: true,
        })
        if (!yes) return
        return run(async () => {
          play('delete')
          await api.emptyTrash()
          toast({ message: 'Emptied the trash' })
        })
      },

      reveal: (item: Item) => run(() => api.revealInFinder(item.id)),

      copyPath: (item: Item) =>
        run(async () => {
          await navigator.clipboard.writeText(await api.itemPath(item.id))
          toast({ message: 'Copied path' })
        }),
    }
  }, [reload, toast])
}

/** "Its 2 milestones, 8 tasks and 2 pages", or null when there's nothing inside. */
function describeInside(items: Item[], id: string): string | null {
  const counts = new Map<Kind, number>()
  // Asks the index (domain/items.ts) for each folder's contents, so this costs
  // one step per item inside, not a pass over the whole library for each one.
  const walk = (parent: string) => {
    for (const child of [...childrenOf(items, parent), ...childrenOf(items, parent, true)]) {
      counts.set(child.kind, (counts.get(child.kind) ?? 0) + 1)
      walk(child.id)
    }
  }
  walk(id)
  const order: Kind[] = ['project', 'milestone', 'task', 'page']
  const words = vocab()
  const parts = order.filter((kind) => counts.get(kind)).map((kind) => words.count(counts.get(kind) ?? 0, kind))
  if (parts.length === 0) return null
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
  return `Its ${list}`
}
