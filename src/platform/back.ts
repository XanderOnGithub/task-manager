// The Android back button. The web view would go back in its history, which
// this app doesn't use, so the button is handled here: it closes what is on top
// (a dialog, the drawer, the details sheet), then goes back to the Tasks
// overview, and only then leaves the app. A computer has no back button, so
// there this does nothing.

import { useEffect, useRef } from 'react'
import { isAndroid } from './os'

/**
 * `goBack` closes or goes back one step and returns true, or returns false when
 * there is nowhere left to go (the button then leaves the app).
 */
export function useBackButton(goBack: () => boolean) {
  const latest = useRef(goBack)
  useEffect(() => {
    latest.current = goBack
  })

  useEffect(() => {
    if (!isAndroid) return
    let stop: (() => Promise<void>) | undefined
    let cancelled = false
    void import('@tauri-apps/api/app').then(async ({ onBackButtonPress }) => {
      const listener = await onBackButtonPress(() => {
        if (latest.current()) return
        // Nothing to close: leave the app, as the back button does.
        void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().close())
      })
      if (cancelled) void listener.unregister()
      else stop = () => listener.unregister()
    })
    return () => {
      cancelled = true
      void stop?.()
    }
  }, [])
}
