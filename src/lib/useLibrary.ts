// Loads the data folder and keeps it fresh.
//
// The snapshot reloads after any change you make (call `reload`) and whenever
// files change outside the app (the Rust watcher sends `data-changed`).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { loadLibrary, onDataChanged, type Item, type Snapshot } from './api'

export interface Library {
  snapshot: Snapshot | null
  error: string | null
  /** Item lookup by id. */
  byId: Map<string, Item>
  reload: () => Promise<void>
}

export function useLibrary(): Library {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setSnapshot(await loadLibrary())
      setError(null)
    } catch (e) {
      setError(String(e))
    }
  }, [])

  useEffect(() => {
    void reload()
    const stop = onDataChanged(() => void reload())
    return () => {
      void stop.then((unlisten) => unlisten())
    }
  }, [reload])

  const byId = useMemo(() => new Map(snapshot?.items.map((i) => [i.id, i]) ?? []), [snapshot])

  return { snapshot, error, byId, reload }
}
