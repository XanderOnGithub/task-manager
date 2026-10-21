// Git sync status for the UI. The work happens in Rust (sync.rs); this keeps
// the latest status and the clock for "Synced 2 min ago".

import { useCallback, useEffect, useState } from 'react'
import { onSyncChanged, syncNudge, syncState, type SyncInfo } from '../../platform/api'

export function useSync() {
  const [info, setInfo] = useState<SyncInfo | null>(null)
  // Ticks so "2 min ago" moves on without any other change.
  const [now, setNow] = useState(() => Date.now())

  const refresh = useCallback(() => {
    syncState()
      .then(setInfo)
      .catch(() => setInfo(null))
  }, [])

  useEffect(() => {
    refresh()
    const stop = onSyncChanged(refresh)
    const clock = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => {
      void stop.then((off) => off())
      window.clearInterval(clock)
    }
  }, [refresh])

  return { info, now, refresh }
}

/** Pulls when the window comes back to the front (Rust skips it if it just synced). */
export function useSyncOnFocus() {
  useEffect(() => {
    const onFocus = () => void syncNudge().catch(() => {})
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])
}
