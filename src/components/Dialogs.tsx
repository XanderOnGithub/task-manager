// Quick capture (⌘N), Settings, and the first-run "choose a data folder" screen.

import { useEffect, useState } from 'react'
import { FolderOpen, Layers } from 'lucide-react'
import { open } from '@tauri-apps/plugin-dialog'
import { getHighRefresh, setDataFolder, setHighRefresh, type HighRefresh } from '../lib/api'
import { useFrameRate } from '../lib/useFrameRate'
import { useTheme, type Theme } from '../lib/theme'
import { useToast } from '../lib/toast'
import { Modal, Segmented, Switch } from './controls'
import { Panel } from './ui'

export function QuickCapture({ onCapture, onClose }: { onCapture: (text: string) => Promise<unknown>; onClose: () => void }) {
  const [text, setText] = useState('')

  const submit = async () => {
    if (!text.trim()) return
    onClose()
    await onCapture(text.trim())
  }

  return (
    <Modal label="Quick capture" onClose={onClose} width="w-[560px]">
      <label className="flex h-[52px] items-center gap-3 px-4 text-fg-3">
        <Layers size={18} strokeWidth={1.75} aria-hidden="true" />
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
          placeholder="Add to Unsorted"
          aria-label="Add to Unsorted"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-placeholder"
        />
        <kbd className="font-mono text-label font-normal">↵</kbd>
      </label>
    </Modal>
  )
}

/** Opens the native folder picker. Returns the chosen folder, or null if cancelled. */
async function pickFolder(): Promise<string | null> {
  const chosen = await open({ directory: true, title: 'Choose a data folder' })
  return typeof chosen === 'string' ? chosen : null
}

export function Settings({
  dataFolder,
  onClose,
  onFolderChanged,
}: {
  dataFolder: string | null
  onClose: () => void
  onFolderChanged: () => Promise<void>
}) {
  const [theme, setTheme] = useTheme()
  const toast = useToast()

  const change = async () => {
    const folder = await pickFolder()
    if (!folder) return
    try {
      await setDataFolder(folder)
      await onFolderChanged()
      toast({ message: 'Opened data folder' })
    } catch (e) {
      toast({ message: String(e), tone: 'error' })
    }
  }

  return (
    <Modal label="Settings" onClose={onClose}>
      <div className="flex flex-col gap-5 p-5">
        <h2 className="text-heading">Settings</h2>

        <div className="flex flex-col gap-2">
          <div className="text-meta text-fg-2">Data folder</div>
          {/* The one place a path is shown: it's the setting itself. */}
          <div className="rounded-control border border-border bg-field px-2.5 py-2 font-mono text-meta font-normal break-all text-fg-2 select-text">
            {dataFolder ?? 'None chosen'}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void change()}
              className="flex h-7 items-center gap-1.5 rounded-control bg-raised px-3 transition-colors duration-100 hover:bg-hover"
            >
              <FolderOpen size={14} strokeWidth={1.75} aria-hidden="true" />
              Choose folder
            </button>
          </div>
          <p className="text-meta font-normal text-fg-3">
            Plain markdown files. Point any folder sync at it to use it on another computer.
          </p>
        </div>

        <HighRefreshSetting />

        <div className="flex flex-col gap-2">
          <div className="text-meta text-fg-2">Appearance</div>
          <Segmented<Theme>
            label="Appearance"
            size="sm"
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </div>
      </div>
    </Modal>
  )
}

/** Shown on first launch of a real build, before any folder is chosen. */
export function ChooseFolder({ onChosen }: { onChosen: () => Promise<void> }) {
  const toast = useToast()
  const choose = async () => {
    const folder = await pickFolder()
    if (!folder) return
    try {
      await setDataFolder(folder)
      await onChosen()
    } catch (e) {
      toast({ message: String(e), tone: 'error' })
    }
  }
  return (
    <Panel label="Choose a data folder" className="flex-1 items-center justify-center">
      <div className="flex max-w-[360px] flex-col items-center gap-3 text-center">
        <h1 className="text-title">Choose a data folder</h1>
        <p className="text-fg-2">
          Tasks and notes are saved there as plain markdown files. An empty folder is fine.
        </p>
        <button
          onClick={() => void choose()}
          className="mt-2 flex h-8 items-center gap-2 rounded-row bg-accent px-3.5 font-medium text-on-accent"
        >
          <FolderOpen size={15} strokeWidth={1.75} aria-hidden="true" />
          Choose folder
        </button>
      </div>
    </Panel>
  )
}

/**
 * Experimental: draw at 120fps on ProMotion displays (macOS). The live readout
 * shows what the window is actually doing, so you can tell whether it worked.
 */
function HighRefreshSetting() {
  const [state, setState] = useState<HighRefresh | null>(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const fps = useFrameRate()

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

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <div className="flex flex-1 flex-col gap-0.5">
          <span className="text-meta text-fg-2">Smoother animation (120fps)</span>
          <span className="text-meta font-normal text-fg-3">
            {state && !state.supported
              ? 'Only available on macOS'
              : 'Experimental. Uses a little more battery on ProMotion displays.'}
          </span>
        </div>
        <Switch
          label="Smoother animation"
          checked={state?.enabled ?? false}
          disabled={!state?.supported || busy}
          onChange={(enabled) => void change(enabled)}
        />
      </div>
      <span className="font-mono text-label font-normal text-fg-3">
        {fps === null ? 'Measuring frame rate' : `Drawing at ${fps} fps`}
      </span>
    </div>
  )
}
