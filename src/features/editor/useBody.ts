// Reads an item's body (the text under its frontmatter). Bodies aren't in the
// snapshot, to keep loading fast, so they're read when something is opened.

import { useCallback, useEffect, useState } from 'react'
import { readBody } from '../../platform/api'

export type BodyState =
  | { status: 'loading' }
  | { status: 'ready'; body: string }
  /** The read failed. Showing an empty editor instead would let a later edit replace the real text. */
  | { status: 'error'; message: string; retry: () => void }

/**
 * The body of item `id`. Reads again when `revision` changes (the file changed
 * outside the app, see bodyChanges.ts). While it re-reads, the text already
 * shown stays; a failed re-read keeps it too.
 */
export function useBody(id: string, revision = 0): BodyState {
  const [result, setResult] = useState<{ id: string; body: string } | { id: string; error: string } | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let current = true
    readBody(id)
      .then((body) => current && setResult({ id, body }))
      .catch((e) => {
        if (!current) return
        // A failed re-read of text that is already showing leaves it alone.
        setResult((prev) => (prev?.id === id && 'body' in prev ? prev : { id, error: String(e) }))
      })
    return () => {
      current = false
    }
  }, [id, revision, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  // Hide the previous item's body while the new one loads.
  if (result?.id !== id) return { status: 'loading' }
  if ('body' in result) return { status: 'ready', body: result.body }
  return { status: 'error', message: result.error, retry }
}
