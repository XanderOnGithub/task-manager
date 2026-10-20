// Settings → Smoother animation (120fps). macOS only; General shows it there.

import { useEffect, useState } from 'react'
import { getHighRefresh, setHighRefresh, type HighRefresh } from '../../platform/api'
import { Switch } from '../../shared/controls'
import { useToast } from '../../shared/toast/toast'

/**
 * Experimental: draw at 120fps on ProMotion displays. macOS only (the
 * Settings dialog doesn't render it anywhere else).
 */
export function HighRefreshSetting() {
  const [state, setState] = useState<HighRefresh | null>(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  useEffect(() => {
    getHighRefresh()
      .then(setState)
      .catch(() => setState({ supported: false, enabled: false }))
  }, [])

  const change = async (enabled: boolean) => {
    setBusy(true)
    try {
      await setHighRefresh(enabled)
      // The new frame rate applies to a fresh page.
      window.location.reload()
    } catch (e) {
      toast({ message: String(e), tone: 'error' })
      setBusy(false)
    }
  }

  // If the Rust side says it can't flip the flag, don't offer a dead switch.
  if (state && !state.supported) return null

  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="text-meta text-fg-2">Smoother animation (120fps)</span>
        <span className="text-meta font-normal text-fg-3">
          Experimental. Uses a little more battery on ProMotion displays.
        </span>
      </div>
      <Switch
        label="Smoother animation"
        checked={state?.enabled ?? false}
        disabled={!state || busy}
        onChange={(enabled) => void change(enabled)}
      />
    </div>
  )
}
