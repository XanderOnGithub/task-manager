// Loads the data folder and keeps it fresh.
//
// The snapshot reloads after any change you make (call `reload`) and whenever
// files change outside the app (the Rust watcher sends `data-changed`).
// Unchanged items keep their objects between reloads (see share.ts), so only
// the rows that changed redraw.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getDataFolder, loadLibrary, onDataChanged, type Item, type Snapshot } from '../platform/api'
import { notifyBodyChanges } from '../features/editor/bodyChanges'
import { shareSnapshot } from './share'

export interface Library {
  snapshot: Snapshot | null
  error: string | null
  /** True when no data folder has been chosen yet. */
  needsFolder: boolean
  /** Item lookup by id. */
  byId: Map<string, Item>
  /**
   * Counts finished loads. The snapshot stays the same object when nothing in
   * it changed, so things kept outside it (the trash) watch this instead.
   */
  loads: number
  reload: () => Promise<void>
}

export function useLibrary(): Library {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [needsFolder, setNeedsFolder] = useState(false)
  const [loads, setLoads] = useState(0)

  // Reloads can overlap (you change something while a sync lands). Each takes a
  // number, and only the newest one's answer is used: an older answer arriving
  // late would otherwise put an out-of-date library on screen.
  const newest = useRef(0)

  const reload = useCallback(async () => {
    const mine = ++newest.current
    try {
      if ((await getDataFolder()) === null) {
        if (mine === newest.current) setNeedsFolder(true)
        return
      }
      const next = await loadLibrary()
      if (mine !== newest.current) return
      setNeedsFolder(false)
      setSnapshot((prev) => shareSnapshot(prev, next))
      setLoads((n) => n + 1)
      setError(null)
    } catch (e) {
      if (mine === newest.current) setError(String(e))
    }
  }, [])

  useEffect(() => {
    void reload()
    const stop = onDataChanged((paths) => {
      // An open page re-reads its text if its own file is among the changes.
      notifyBodyChanges(paths)
      void reload()
    })
    return () => {
      void stop.then((unlisten) => unlisten())
    }
  }, [reload])

  const byId = useMemo(() => new Map(snapshot?.items.map((i) => [i.id, i]) ?? []), [snapshot])

  return { snapshot, error, needsFolder, byId, loads, reload }
}
