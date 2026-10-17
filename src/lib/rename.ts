// "Rename" from somewhere other than the item's own view (the right-click
// menu): the app opens the item, then asks whichever view shows it to start
// editing its title.

import { useEffect, useRef } from 'react'

const EVENT = 'moss-rename'

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
