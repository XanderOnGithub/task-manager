// Things the right-click menu asks of a view: "Rename" and "New …". The app
// opens the item first, then asks whichever view shows it to start editing
// its title, or to focus its "Add a …" field.

import { useEffect, useRef } from 'react'

const EVENT = 'moss-rename'
const ADD = 'moss-add'

/** What "New …" adds. */
export type AddWhat = 'project' | 'milestone' | 'task' | 'page'

/** Asks the view showing `id` to start renaming it (once it has opened). */
export function requestRename(id: string) {
  // Give the newly opened view a moment to mount and listen.
  window.setTimeout(() => window.dispatchEvent(new CustomEvent(EVENT, { detail: id })), 60)
}

/** Calls `start` when a rename is requested for `id`. */
export function useRenameRequest(id: string | undefined, start: () => void) {
  const latest = useRef(start)
  latest.current = start
  useEffect(() => {
    if (!id) return
    const onRequest = (e: Event) => (e as CustomEvent<string>).detail === id && latest.current()
    window.addEventListener(EVENT, onRequest)
    return () => window.removeEventListener(EVENT, onRequest)
  }, [id])
}

/** Asks the view showing `id` to focus its field for adding `what` inside it. */
export function requestAdd(id: string, what: AddWhat) {
  window.setTimeout(() => window.dispatchEvent(new CustomEvent(ADD, { detail: { id, what } })), 60)
}

/** Calls `start` when "New …" asks for something to be added inside `id`. */
export function useAddRequest(id: string | undefined, start: (what: AddWhat) => void) {
  const latest = useRef(start)
  latest.current = start
  useEffect(() => {
    if (!id) return
    const onRequest = (e: Event) => {
      const { detail } = e as CustomEvent<{ id: string; what: AddWhat }>
      if (detail.id === id) latest.current(detail.what)
    }
    window.addEventListener(ADD, onRequest)
    return () => window.removeEventListener(ADD, onRequest)
  }, [id])
}
