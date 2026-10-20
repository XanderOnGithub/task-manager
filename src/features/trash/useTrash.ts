// What's in the trash, refreshed whenever the library reloads (deleting,
// restoring and emptying all reload it).

import { useEffect, useState } from 'react'
import { listTrash, type Snapshot, type TrashEntry } from '../../platform/api'

/** `loads` (from useLibrary) changes on every reload, even when no item did. */
export function useTrash(snapshot: Snapshot | null, loads: number): TrashEntry[] {
  const [entries, setEntries] = useState<TrashEntry[]>([])
  useEffect(() => {
    if (!snapshot) return
    let current = true
    listTrash()
      .then((list) => current && setEntries(list))
      .catch(() => current && setEntries([]))
    return () => {
      current = false
    }
  }, [snapshot, loads])
  return entries
}
