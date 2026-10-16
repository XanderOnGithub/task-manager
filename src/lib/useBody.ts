// Reads an item's body (the text under its frontmatter). Bodies aren't in the
// snapshot, to keep loading fast, so they're read when something is opened.

import { useEffect, useState } from 'react'
import { readBody } from './api'

/** The body of item `id`, or null while it loads. Reloads when `version` changes. */
export function useBody(id: string, version?: unknown): string | null {
  const [loaded, setLoaded] = useState<{ id: string; body: string } | null>(null)
  useEffect(() => {
    let current = true
    readBody(id)
      .then((body) => current && setLoaded({ id, body }))
      .catch(() => current && setLoaded({ id, body: '' }))
    return () => {
      current = false
    }
  }, [id, version])
  // Hide the previous item's body while the new one loads.
  return loaded?.id === id ? loaded.body : null
}
