// Quick capture (⌘N), Settings, and the first-run "choose a data folder" screen.

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { FolderOpen, Layers, Play } from 'lucide-react'
import { spring } from '../lib/motion'
import { open } from '@tauri-apps/plugin-dialog'
import { getHighRefresh, setDataFolder, setHighRefresh, type HighRefresh } from '../lib/api'
import { useFrameRate } from '../lib/useFrameRate'
import { useTheme, type Theme } from '../lib/theme'
import { useToast } from '../lib/toast'
import { Modal, Segmented, Switch } from './controls'
import { Panel } from './ui'
import { play, setSoundSettings, SOUND_INFO, soundSettings, type SoundName, type SoundSettings } from '../lib/sounds'

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
  const [tab, setTab] = useState<'general' | 'sounds'>('general')
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
    <Modal label="Settings" onClose={onClose} width="w-[520px]">
      <div className="flex items-center gap-3 px-5 pt-5">
        <h2 className="flex-1 text-heading">Settings</h2>
        <Segmented<'general' | 'sounds'>
          label="Settings section"
          size="sm"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'general', label: 'General' },
            { value: 'sounds', label: 'Sounds' },
          ]}
        />
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {tab === 'sounds' ? (
          <motion.div key="sounds" {...tabMotion(1)}>
            <SoundsTab />
          </motion.div>
        ) : (
          <motion.div key="general" {...tabMotion(-1)} className="flex flex-col gap-5 p-5">
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
          </motion.div>
        )}
      </AnimatePresence>
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

/** Tabs slide a little toward the side they come from. */
const tabMotion = (side: number) => ({
  initial: { opacity: 0, x: 10 * side },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 10 * side },
  transition: spring.snappy,
})

/** Settings → Sounds: everything on/off, volume, each sound on its own, and the Fun corner. */
function SoundsTab() {
  const [value, setValue] = useState<SoundSettings>(soundSettings)
  const update = (next: SoundSettings) => {
    setValue(next)
    setSoundSettings(next)
  }
  const toggle = (name: SoundName, on: boolean) => {
    update({ ...value, muted: on ? value.muted.filter((n) => n !== name) : [...value.muted, name] })
    if (on) play(name, { force: true })
  }
  // A little typed phrase, for hearing the keyboard sounds without typing.
  const demoTyping = () => {
    const keys: SoundName[] = ['key', 'key', 'key', 'key', 'keySpace', 'key', 'key', 'keyDelete', 'key', 'key', 'keyEnter']
    keys.forEach((k, i) => window.setTimeout(() => play(k, { force: true }), i * 85 + Math.random() * 30))
  }

  return (
    <div className="flex max-h-[62vh] flex-col gap-5 overflow-y-auto p-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="flex flex-1 flex-col gap-0.5">
            <span className="text-meta text-fg-2">Sounds</span>
            <span className="text-meta font-normal text-fg-3">Soft, quiet sounds when something changes.</span>
          </div>
          <Switch
            label="Sounds"
            checked={value.on}
            onChange={(on) => {
              update({ ...value, on })
              if (on) play('complete', { force: true })
            }}
          />
        </div>
        <label className={`flex items-center gap-3 transition-opacity duration-150 ${value.on ? '' : 'opacity-40'}`}>
          <span className="w-[52px] text-meta font-normal text-fg-3">Volume</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={value.volume}
            disabled={!value.on}
            onChange={(e) => update({ ...value, volume: Number(e.currentTarget.value) })}
            // Play a sample when you let go, so you hear the new level.
            onPointerUp={() => play('complete')}
            onKeyUp={() => play('complete')}
            aria-label="Sound volume"
            className="flex-1 accent-accent"
          />
        </label>
      </div>

      <div className={`flex flex-col gap-1 transition-opacity duration-150 ${value.on ? '' : 'pointer-events-none opacity-40'}`}>
        <div className="pb-1 text-label tracking-label text-fg-3 uppercase">Each sound</div>
        {SOUND_INFO.map(({ name, label, when }) => (
          <SoundRow
            key={name}
            label={label}
            when={when}
            on={!value.muted.includes(name)}
            onTest={() => play(name, { force: true })}
            onToggle={(on) => toggle(name, on)}
          />
        ))}
      </div>

      <div className={`flex flex-col gap-1 transition-opacity duration-150 ${value.on ? '' : 'pointer-events-none opacity-40'}`}>
        <div className="pb-1 text-label tracking-label text-fg-3 uppercase">Fun</div>
        <SoundRow
          label="Typing"
          when="A soft keyboard click as you type in any text field. Off by default."
          on={value.typing}
          onTest={demoTyping}
          onToggle={(typing) => {
            update({ ...value, typing })
            if (typing) demoTyping()
          }}
        />
      </div>
    </div>
  )
}

function SoundRow({
  label,
  when,
  on,
  onTest,
  onToggle,
}: {
  label: string
  when: string
  on: boolean
  onTest: () => void
  onToggle: (on: boolean) => void
}) {
  return (
    <div className="flex min-h-10 items-center gap-3 rounded-control py-1 pr-0.5 pl-1">
      <button
        onClick={onTest}
        aria-label={`Play ${label}`}
        title="Play"
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-raised text-fg-2 transition-[color,background-color,transform] duration-100 hover:bg-hover hover:text-fg active:scale-90"
      >
        <Play size={12} strokeWidth={2.25} className="translate-x-px" aria-hidden="true" />
      </button>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className={on ? 'text-fg' : 'text-fg-3'}>{label}</span>
        <span className="truncate text-label font-normal text-fg-3">{when}</span>
      </div>
      <Switch label={label} checked={on} onChange={onToggle} />
    </div>
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
