// Draws a long list in two steps so opening it doesn't freeze the window.
//
// The first `first` entries are drawn at once (what you see on opening). The
// rest follow in a transition, which React draws in small slices between
// frames and drops if something more urgent (a click, a key) comes in.

import { startTransition, useEffect, useState } from 'react'

/** How many of `total` entries to draw right now. */
export function useProgressive(total: number, first: number): number {
  const [all, setAll] = useState(total <= first)
  useEffect(() => {
    if (all || total <= first) return
    startTransition(() => setAll(true))
  }, [all, total, first])
  return all || total <= first ? total : first
}
