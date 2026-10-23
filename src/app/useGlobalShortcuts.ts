// The shortcuts that work anywhere in the window: ⌘N Quick capture, ⌘K search,
// ⌘\ the sidebar. (Row keys, like arrows and Enter, are in
// features/navigation/rowKeys.ts.)

import { useEffect, useRef } from 'react'

interface Shortcuts {
  onCapture: () => void
  /** Toggles search: opens it, or closes it if it is open. */
  onSearch: () => void
  onSidebar: () => void
}

export function useGlobalShortcuts(shortcuts: Shortcuts) {
  // The handlers change on every render; the listener is added once and reads
  // the latest through this.
  const latest = useRef(shortcuts)
  useEffect(() => {
    latest.current = shortcuts
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const run =
        e.key.toLowerCase() === 'n'
          ? latest.current.onCapture
          : e.key.toLowerCase() === 'k'
            ? latest.current.onSearch
            : e.key === '\\'
              ? latest.current.onSidebar
              : null
      if (!run) return
      e.preventDefault()
      run()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
