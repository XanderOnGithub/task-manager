// What's in the trash, refreshed whenever the library reloads (deleting,
// restoring and emptying all reload it).

import { useEffect, useState } from 'react'
import { listTrash, type Snapshot, type TrashEntry } from './api'

export function useTrash(snapshot: Snapshot | null): TrashEntry[] {
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
  }, [snapshot])
  return entries
}
